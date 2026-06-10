type ChatReceiptStatus = "sent" | "delivered" | "read";

type Props = {
  status?: ChatReceiptStatus;
  className?: string;
};

export function ChatMessageReceipt({ status = "sent", className }: Props) {
  const read = status === "read";
  const delivered = status === "delivered" || read;
  const colorClass = read ? " chat-receipt--read" : "";

  return (
    <span
      className={`chat-receipt${colorClass}${className ? ` ${className}` : ""}`}
      aria-label={receiptLabel(status)}
    >
      <svg viewBox="0 0 18 11" width="16" height="10" aria-hidden>
        <path
          d="M1.2 5.6 4.4 8.8 9.8 2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {delivered ? (
          <path
            d="M5.2 5.6 8.4 8.8 13.8 2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
    </span>
  );
}

function receiptLabel(status: ChatReceiptStatus): string {
  switch (status) {
    case "read":
      return "تمت القراءة";
    case "delivered":
      return "تم التسليم";
    default:
      return "تم الإرسال";
  }
}
