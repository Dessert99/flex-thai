export interface EmailLinkConfirmPageViewProps {
  errorMessage?: string;
  invalidLink: boolean;
  onConfirm: () => void;
  pending: boolean;
}
