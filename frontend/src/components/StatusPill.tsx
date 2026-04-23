import './StatusPill.css';
interface Props { status: 'ok' | 'warn' | 'err'; children: React.ReactNode; }
export default function StatusPill({ status, children }: Props) {
  return <span className={`status-pill ${status}`}>{children}</span>;
}
