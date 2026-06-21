# Settings

`SettingsModal` ports legacy settings: colour themes (CSS variables), property manager renames, drag mode, import/export, and sign-in link.

## Persistence

- **Without Supabase:** themes and manager renames save to `localStorage` (`bme-settings`).
- **With Supabase + auth:** same payload upserts to `app_settings` key `portfolio_settings`.

Themes are defined in `@/lib/themes` (`APP_THEMES`). Preview applies live; **Apply & save** commits and closes the modal.
