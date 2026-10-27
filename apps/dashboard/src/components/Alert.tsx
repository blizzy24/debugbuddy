import { AlertIcon } from './Icons';

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
      <AlertIcon className="mt-0.5 h-4 w-4 flex-none" />
      <span>{message}</span>
    </div>
  );
}
