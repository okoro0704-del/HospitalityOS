import { isModuleId, listModuleCatalog, type ModuleId } from "@hospitalityos/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";

export function getModuleCatalog() {
  return listModuleCatalog();
}

export async function getTenantModules(tenantId: string) {
  const rows = await prisma.tenantModule.findMany({ where: { tenantId } });
  const catalog = listModuleCatalog();
  return catalog.map((mod) => {
    const row = rows.find((r) => r.moduleId === mod.id);
    return {
      ...mod,
      enabled: row?.enabled ?? false,
      config: (row?.config as Record<string, unknown>) ?? {},
      enabledAt: row?.enabledAt?.toISOString() ?? null,
    };
  });
}

export async function setTenantModule(opts: {
  tenantId: string;
  moduleId: string;
  enabled: boolean;
  actorId?: string;
  config?: Record<string, unknown>;
}) {
  if (!isModuleId(opts.moduleId)) {
    throw Object.assign(new Error("Unknown module"), { code: "invalid_module", statusCode: 400 });
  }

  const configValue = (opts.config ?? {}) as Prisma.InputJsonValue;

  const row = await prisma.tenantModule.upsert({
    where: {
      tenantId_moduleId: {
        tenantId: opts.tenantId,
        moduleId: opts.moduleId,
      },
    },
    create: {
      tenantId: opts.tenantId,
      moduleId: opts.moduleId,
      enabled: opts.enabled,
      config: configValue,
    },
    update: {
      enabled: opts.enabled,
      config: configValue,
      ...(opts.enabled ? { enabledAt: new Date() } : {}),
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.actorId,
    action: opts.enabled ? "module.enable" : "module.disable",
    resource: "module",
    resourceId: opts.moduleId,
  });

  return row;
}

export async function assertModuleEnabled(tenantId: string, moduleId: ModuleId) {
  const row = await prisma.tenantModule.findUnique({
    where: { tenantId_moduleId: { tenantId, moduleId } },
  });
  return Boolean(row?.enabled);
}
