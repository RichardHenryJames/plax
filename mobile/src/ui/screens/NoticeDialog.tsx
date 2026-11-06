import { useT } from '../i18n-context'
import { Dialog, type DialogAction } from '../overlays'
import { DialogScroll, Paragraph } from './parts'

export interface NoticeDialogProps {
  visible: boolean
  /** The notice's title and text in the reader's language, as the website wrote them (NoticeDialog does not translate or change them). */
  title: string
  body: string
  /** The notice has a page to open: "Learn more" is offered. */
  hasLink: boolean
  /** "Done": the reader has read it (and it is not shown again). */
  onDone: () => void
  /** "Learn more": the host opens the notice's page; the reader has read it too. */
  onMore: () => void
  /** The back button and a tap outside: closed without an answer, so a notice that matters comes back. */
  onCancel: () => void
}

/**
 * A notice from the website (MainActivity.showPrompt): a title, a text, Done, and "Learn more" when the notice has a link. The host tells
 * the three ways it can end apart (Done and Learn more count as read; leaving does not). The text scrolls inside the dialog.
 */
export function NoticeDialog({ visible, title, body, hasLink, onDone, onMore, onCancel }: NoticeDialogProps) {
  const { t } = useT()
  const actions: DialogAction[] = []
  if (hasLink) actions.push({ label: t('notice_more'), onPress: onMore })
  actions.push({ label: t('done'), onPress: onDone })
  return (
    <Dialog visible={visible} title={title} onClose={onCancel} actions={actions} testID="notice-dialog">
      <DialogScroll testID="notice-scroll">
        <Paragraph size={15} multiplier={1.25} color="text2" testID="notice-body">
          {body}
        </Paragraph>
      </DialogScroll>
    </Dialog>
  )
}
