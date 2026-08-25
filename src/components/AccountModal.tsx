import Overlay from './Overlay';
import AccountPanel from './AccountPanel';
import { FEATURES } from '../config';
import { CARD_FLAT } from './matchUi';

/** Signing in, and managing the account once you are. Its own dialog, opened by the
 *  masthead's account button: it used to be the first group inside the settings sheet,
 *  which buried the one thing a new player might actually want to do behind a gear
 *  icon, next to unrelated preferences. Renders nothing when no server is configured,
 *  same as the panel it wraps. */
export default function AccountModal({
  email,
  onClose,
  onAccountChanged,
}: {
  /** The signed-in address, or null for a guest. */
  email: string | null;
  onClose: () => void;
  /** Signed in or out: the store has to be rebuilt, so App reloads. */
  onAccountChanged: () => void;
}) {
  if (!FEATURES.accounts) return null;
  const title = email ? 'Account' : 'Sign in';
  return (
    <Overlay onClose={onClose} ariaLabel={title}>
      <h2 className="mb-3 font-display text-[20px] font-extrabold uppercase tracking-[-0.01em]">
        {title}
      </h2>
      <div className={`${CARD_FLAT} px-5 py-4`}>
        <AccountPanel email={email} onSignedIn={onAccountChanged} onSignedOut={onAccountChanged} />
      </div>
    </Overlay>
  );
}
