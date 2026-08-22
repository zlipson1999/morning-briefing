/** A message as it's kept on disk. */
export type StoredMessage = {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  preview: string;
  receivedIso: string;
  important: boolean;
  hasAttachment: boolean;
  label: string;
  updatedAt: number;
};

/** What the panel and the briefing read. */
export type MailMessage = {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  preview: string;
  /** "7:42 AM", "Yesterday 9:07 PM", "Aug 18". */
  receivedLabel: string;
  receivedAt: number | null;
  important: boolean;
  hasAttachment: boolean;
  label: string;
};
