package com.plaxlabs.news;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.Key;
import java.security.KeyStore;
import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Account secrets, sealed with an AES-256-GCM key that is generated inside and never leaves the Android
 * Keystore, in a file kept out of every backup. If the phone cannot do that, nothing is stored.
 */
final class SecureStore implements TokenStore {
    private static final String ALIAS = "plax-account-v1", PROVIDER = "AndroidKeyStore", TRANSFORM = "AES/GCM/NoPadding";
    private static final byte[] CONTEXT = "plax-account".getBytes(StandardCharsets.US_ASCII);
    private static final int IV_BYTES = 12, TAG_BITS = 128, MAX_BYTES = 256 * 1024;

    private final AtomicFile file;
    private final String alias;

    SecureStore(File directory) { this(directory, ALIAS); }

    /** For tests, so they never touch the key of a real sign-in. */
    SecureStore(File directory, String alias) {
        file = new AtomicFile(new File(directory, "account.bin"));
        this.alias = alias;
    }

    private SecretKey key(boolean create) throws GeneralSecurityException, IOException {
        KeyStore store = KeyStore.getInstance(PROVIDER);
        store.load(null);
        Key existing = store.getKey(alias, null);
        if (existing instanceof SecretKey secret) return secret;
        if (!create) return null;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER);
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
        return generator.generateKey();
    }

    @Override public String read() throws IOException {
        if (!file.getBaseFile().exists()) return null;
        byte[] data;
        try (InputStream stream = file.openRead()) { data = FeedApi.boundedRead(stream, MAX_BYTES); }
        catch (FileNotFoundException gone) { return null; }
        if (data.length <= IV_BYTES) { clear(); return null; }
        try {
            SecretKey key = key(false);
            // Without its key the file can never be read again, so it is dropped rather than kept.
            if (key == null) { file.delete(); return null; }
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, data, 0, IV_BYTES));
            cipher.updateAAD(CONTEXT);
            return new String(cipher.doFinal(data, IV_BYTES, data.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (BadPaddingException damaged) {
            clear();
            return null;
        } catch (GeneralSecurityException unavailable) {
            throw new IOException("Secure storage unavailable");
        }
    }

    @Override public void write(String text) throws IOException {
        byte[] plain = text.getBytes(StandardCharsets.UTF_8);
        if (plain.length > MAX_BYTES - 64) throw new IOException("Account data is too large");
        byte[] sealed;
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            cipher.updateAAD(CONTEXT);
            byte[] iv = cipher.getIV(), body = cipher.doFinal(plain);
            sealed = new byte[iv.length + body.length];
            System.arraycopy(iv, 0, sealed, 0, iv.length);
            System.arraycopy(body, 0, sealed, iv.length, body.length);
        } catch (GeneralSecurityException unavailable) {
            throw new IOException("Secure storage unavailable");
        }
        FileOutputStream output = file.startWrite();
        try {
            output.write(sealed);
            file.finishWrite(output);
        } catch (IOException failure) {
            file.failWrite(output);
            throw failure;
        }
    }

    /** Forgets the data and the key that sealed it. */
    @Override public void clear() {
        file.delete();
        try {
            KeyStore store = KeyStore.getInstance(PROVIDER);
            store.load(null);
            if (store.containsAlias(alias)) store.deleteEntry(alias);
        } catch (GeneralSecurityException | IOException ignored) { /* the key is useless without the file */ }
    }
}
