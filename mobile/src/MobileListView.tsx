import { TaskList } from '../../components/TaskList';
import {useAppLocale} from '../../components/i18n/AppLocaleProvider';

/**
 * The native List View reuses the canonical web operational table.
 * TaskList already implements scoped Process/Inbox selection, inline status
 * and priority edits, property filters, sorting, column preferences and the
 * narrow-screen card layout. Do not fork those behaviors into a second list.
 *
 * Process administration is not yet supported by the Capacitor runtime.
 */
export function MobileListView() {
  const {t}=useAppLocale();
  return (
    <section className="workspace mobile-product-view mobile-operational-list" aria-label={t("Action list")}>
      <TaskList allowProcessAdministration={false} mobileCompact />
    </section>
  );
}
