import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { getSiteSettings } from "@/modules/settings/site";
import { PageHead } from "@/ui/admin/fields";
import { SettingsForm } from "@/ui/admin/SettingsForm";

export default async function SettingsAdminPage() {
  const user = await requirePermission("setting:read");
  const settings = await getSiteSettings(await getDb());
  return (
    <>
      <PageHead eyebrow="Sistema" title="Ajustes del sitio" />
      <p className="mt-4 max-w-[70ch] text-muted">
        Textos que la web muestra en el título del navegador, el newsletter y el pie. Si algo se deja como está, la web
        se ve igual que antes.
      </p>
      <div className="mt-8">
        <SettingsForm initial={settings} canSave={can(user.role, "setting:update")} />
      </div>
    </>
  );
}
