// Kit entry, from Firebase's "Migrate to a self-created function kit" template.
// EXT_MIGRATED_SYSTEM_* come from `firebase ext:export --mode functions`.
import { setGlobalOptions } from "firebase-functions";
import {
  MemoryOption,
  VpcEgressSetting,
  IngressSetting,
} from "firebase-functions/v2/options";
import { defineString } from "firebase-functions/params";

export const regionParam = defineString("FUNCTION_DEFAULT_REGION", {
  input: { text: { nonEmpty: true } },
  description:
    "Global default region where functions should be deployed. Can be overridden per-function.",
});

setGlobalOptions({
  region: regionParam,
  memory: (process.env.EXT_MIGRATED_SYSTEM_MEMORY as MemoryOption) ?? undefined,
  timeoutSeconds: process.env.EXT_MIGRATED_SYSTEM_TIMEOUTSECONDS
    ? Number(process.env.EXT_MIGRATED_SYSTEM_TIMEOUTSECONDS)
    : undefined,
  vpcConnectorEgressSettings:
    process.env.EXT_MIGRATED_SYSTEM_VPCCONNECTOREGRESSSETTINGS &&
    process.env.EXT_MIGRATED_SYSTEM_VPCCONNECTOREGRESSSETTINGS !==
      "VPC_CONNECTOR_EGRESS_SETTINGS_UNSPECIFIED"
      ? (process.env
          .EXT_MIGRATED_SYSTEM_VPCCONNECTOREGRESSSETTINGS as VpcEgressSetting)
      : undefined,
  vpcConnector: process.env.EXT_MIGRATED_SYSTEM_VPCCONNECTOR ?? undefined,
  maxInstances: process.env.EXT_MIGRATED_SYSTEM_MAXINSTANCES
    ? Number(process.env.EXT_MIGRATED_SYSTEM_MAXINSTANCES)
    : undefined,
  minInstances: process.env.EXT_MIGRATED_SYSTEM_MININSTANCES
    ? Number(process.env.EXT_MIGRATED_SYSTEM_MININSTANCES)
    : undefined,
  ingressSettings:
    (process.env.EXT_MIGRATED_SYSTEM_INGRESSSETTINGS as IngressSetting) ??
    undefined,
});

export * from "./queue";
