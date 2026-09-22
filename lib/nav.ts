import { type MenuDeviceType, ROLE, DEVICE, MENU_STATUS, SETTINGS_PATH } from "@/lib/constants";
import { localizedName } from "@/lib/localize";

/**
 * 全站导航数据源（UI 侧）
 *  - buildNavGroupsFromMenus：由 menus 表 + menu_groups 表 + userMenuConfig 动态生成导航
 *  - item.key 为 i18n 键（如 "nav.add"）；动态菜单显示名取 name JSON（按 locale 取），
 *    回退到客户端 t(key) / 服务端 d.nav[...]
 *  - 侧边栏 app-shell / 移动端底部 tab / 个人中心 profile / 我的菜单页共用 buildNavGroupsFromMenus
 * Site-wide navigation data source (UI side)
 *  - buildNavGroupsFromMenus: builds nav dynamically from menus + menu_groups + userMenuConfig
 *  - item.key is an i18n key (e.g. "nav.add"); dynamic menu display names come from the name JSON (by locale),
 *    falling back to client t(key) / server d.nav[...]
 *  - Shared by the sidebar app-shell / mobile bottom tab / profile / my-menu pages
 */

// 数据驱动导航（menus 表流派）/ Data-driven nav (menus-table style)

/** menus 表行（服务端查询返回给渲染层）/ A menus-table row (server query → render layer) */
export type MenuRow = {
  menuId: string;
  name: string; // 多语言名称 JSON（DB 存字符串）/ localized name JSON (stored as string in DB)
  icon: string;
  menuGroupId: string;
  sort: number;
  statusCode: string; // active / disabled
  deviceType: MenuDeviceType;
  link: string;
  remark: string | null;
};

/** menu_groups 表行（驱动分组顺序与分组显示名）/ A menu_groups-table row (drives group order & group display name) */
export type MenuGroupRow = {
  menuGroupId: string;
  name: string; // 多语言名称 JSON（DB 存字符串）/ localized name JSON (stored as string in DB)
  sort: number;
  remark: string | null;
};

/** 动态导航项（name 为已按 locale 解析的显示名；缺失时回退 t(key)）/ A dynamic nav item (name already resolved by locale; falls back to t(key) when missing) */
export type DynNavItem = {
  key: string;
  href: string;
  icon: string;
  name: string; // 已按 locale 解析后的显示名 / display name after locale resolution
  deviceType: MenuDeviceType;
};

/** 动态导航分组 / A dynamic nav group */
export type DynNavGroup = {
  group: string;
  name: string; // 已按 locale 解析后的分组显示名 / group display name after locale resolution
  items: DynNavItem[];
};

/**
 * 由 menus 表 + 账本启用配置 + 角色 + 设备类型构建导航分组
 *  - menus：全部 menus 行（函数内按 status_code 过滤）
 *  - enabledIds：本账本启用的 menu_id 集合；null 或空数组 = 全部启用
 *  - userRole：admin 专属项（/settings 入口等）对非 admin 强制隐藏
 *  - deviceType：mobile 时仅保留 device_type='mobile' 的项（桌面端显示全部）
 *  - groups：menu_groups 行（可选），用于分组排序与分组显示名；缺省按 menuGroupId 字母序 + 回退名
 * Build nav groups from menus + ledger-enabled config + role + device type.
 *  - menus: all menu rows (filtered by status_code inside the fn)
 *  - enabledIds: the ledger's enabled menu_id set; null or empty ⇒ all enabled
 *  - userRole: admin-only items (e.g. /settings) are hidden from non-admins
 *  - deviceType: on mobile only device_type='mobile' items are kept (desktop shows all)
 *  - groups: menu_groups rows (optional) for group ordering & display name; defaults to menuGroupId alphabetical + fallback name
 */
export function buildNavGroupsFromMenus(
  menus: MenuRow[],
  enabledIds: string[] | null | undefined,
  userRole: string,
  deviceType: MenuDeviceType,
  locale: string,
  groups?: MenuGroupRow[],
): DynNavGroup[] {
  const enabled = enabledIds && enabledIds.length > 0 ? new Set(enabledIds) : null;

  const visible = menus
    .filter((m) => m.statusCode === MENU_STATUS.active)
    .filter((m) => (deviceType === DEVICE.mobile ? m.deviceType === DEVICE.mobile : true))
    .filter((m) => !(m.link === SETTINGS_PATH && userRole !== ROLE.admin))
    .filter((m) => (enabled ? enabled.has(m.menuId) : true));

  if (visible.length === 0) return [];

  const groupMap = new Map<string, MenuGroupRow>();
  (groups ?? []).forEach((g) => groupMap.set(g.menuGroupId, g));

  // 分组排序：menu_groups.sort 优先，其次 menuGroupId 字母序 / Group ordering: menu_groups.sort first, then menuGroupId alphabetical
  const groupIds = [...new Set(visible.map((m) => m.menuGroupId))];
  groupIds.sort((a, b) => {
    const sa = groupMap.get(a)?.sort ?? Number.MAX_SAFE_INTEGER;
    const sb = groupMap.get(b)?.sort ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });

  const result: DynNavGroup[] = [];
  for (const gid of groupIds) {
    const items = visible
      .filter((m) => m.menuGroupId === gid)
      .sort((a, b) => a.sort - b.sort)
      .map<DynNavItem>((m) => ({
        key: m.menuId,
        href: m.link,
        icon: m.icon,
        name: localizedName(m.name, locale),
        deviceType: m.deviceType,
      }));
    if (items.length === 0) continue;
    const g = groupMap.get(gid);
    result.push({
      group: gid,
      name: g ? localizedName(g.name, locale) : gid,
      items,
    });
  }
  return result;
}
