package com.plaxlabs.news;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Decides which of the website's messages to put in front of the reader now (see {@link AppConfig}): one notice, or, in a Google Play
 * build, that a newer version is on Google Play. Never both at once, and never blocking: every one can be put off. Pure rules and a
 * little memory, so that they can be tested without a screen.
 *
 * <ul>
 *   <li>A notice is shown once for each id, to the builds and versions it is for, until the time it names. One marked important is
 *       shown again at the next start until the reader has said Done; any other is counted as read however it was closed.</li>
 *   <li>An update is offered to a Google Play build older than the newest version the website names, and not again for a day once the
 *       reader said Later (a newer version is offered at once). A build below the least supported version is offered it at every start.
 *       The website's build never sees it: it has its own update feed (see {@link UpdateManager}).</li>
 * </ul>
 */
final class ConfigPrompts {
    /** What is remembered between starts. */
    interface Memory {
        String noticeSeen();
        void noticeSeen(String id);
        long updateVersion();
        long updateAt();
        void updateDismissed(long version, long at);
    }

    /** What to show: a notice, or the update (exactly one is set). {@code required} is an update for a version below the least supported. */
    record Prompt(AppConfig.Notice notice, AppConfig.StoreUpdate update, boolean required) { }

    private final Memory memory;
    private final boolean playBuild;
    private final int installed;
    /** Not put up twice in one run of the app, whatever the reader did with it. */
    private String noticeShown;
    private boolean requiredShown;

    ConfigPrompts(Memory memory, boolean playBuild, int installed) {
        this.memory = memory; this.playBuild = playBuild; this.installed = installed;
    }

    /** What is to be shown now, or null. */
    Prompt next(AppConfig config, long now) {
        AppConfig.Notice notice = config.notice();
        if (notice != null && notice.appliesTo(playBuild, installed, now) && !notice.id().equals(memory.noticeSeen())
                && !notice.id().equals(noticeShown)) return new Prompt(notice, null, false);
        AppConfig.StoreUpdate update = config.update();
        if (playBuild && update != null && installed < update.latestVersionCode()) {
            boolean required = installed < update.minSupportedVersionCode();
            boolean wanted = required ? !requiredShown
                    : update.latestVersionCode() != memory.updateVersion() || AppUpdates.due(now, memory.updateAt());
            if (wanted) return new Prompt(null, update, required);
        }
        return null;
    }

    /** The prompt is on the screen: it is not put up again in this run of the app. */
    void shown(Prompt prompt) {
        if (prompt.notice() != null) noticeShown = prompt.notice().id();
        else if (prompt.required()) requiredShown = true;
    }

    /** The reader closed the prompt. {@code acknowledged} is Done (or Update, for an update); any other way out is not. */
    void closed(Prompt prompt, boolean acknowledged, long now) {
        if (prompt.notice() != null) {
            if (acknowledged || !prompt.notice().important()) memory.noticeSeen(prompt.notice().id());
        } else memory.updateDismissed(prompt.update().latestVersionCode(), now);
    }

    static Memory remembered(Context context) {
        SharedPreferences preferences = context.getApplicationContext().getSharedPreferences("config-prompts", Context.MODE_PRIVATE);
        return new Memory() {
            @Override public String noticeSeen() { return preferences.getString("notice-seen", ""); }
            @Override public void noticeSeen(String id) { preferences.edit().putString("notice-seen", id).apply(); }
            @Override public long updateVersion() { return preferences.getLong("update-version", 0); }
            @Override public long updateAt() { return preferences.getLong("update-at", 0); }
            @Override public void updateDismissed(long version, long at) {
                preferences.edit().putLong("update-version", version).putLong("update-at", at).apply();
            }
        };
    }
}
