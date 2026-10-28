import type { Connection } from "$lib/types"
import { t } from "$lib/i18n"

export type Preset = {
  name: string
  input_storage?: string[]
  input_auth?: string[]
  output_connections: Connection[]
  output_identity_provider: { type: string; params: string }
  output_attribute_mapping: { related_backend: string; params: string }
  isOK: { storage: string; auth: string }
}

export type PresetOutput = {
  connections: Connection[]
  identity_provider: { type: string; params: string }
  attribute_mapping: { related_backend: string; params: string }
}

export const PRESETS: Preset[] = [
  {
    name: "Local files - just for me",
    output_connections: [{ type: "local", label: "local" }],
    output_identity_provider: { type: "passthrough", params: "{\"strategy\":\"password_only\"}" },
    output_attribute_mapping: { related_backend: "local", params: "{\"local\":{\"type\":\"local\",\"password\":\"{{ .password }}\"}}" },
    isOK: { storage: "local", auth: "passthrough" },
  },
  {
    name: "Local Storage - Local Users",
    input_storage: ["admin_password"],
    output_connections: [{ type: "local", label: "local" }],
    output_identity_provider: { type: "local", params: "{}" },
    output_attribute_mapping: {
      related_backend: "local",
      params: "{\"local\":{\"type\":\"local\",\"password\":\"[[admin_password]]\"}}",
    },
    isOK: { storage: "local", auth: "local" },
  },
  {
    name: "SFTP Storage - Use existing credentials",
    input_storage: ["sftp_hostname"],
    output_connections: [{ type: "sftp", label: "sftp" }],
    output_identity_provider: { type: "passthrough", params: "{\"strategy\":\"username_and_password\"}" },
    output_attribute_mapping: { related_backend: "sftp", params: "{\"sftp\":{\"type\":\"sftp\",\"hostname\":\"[[sftp_hostname]]\",\"username\":\"{{ .user }}\",\"password\":\"{{ .password }}\"}}" },
    isOK: { storage: "sftp", auth: "passthrough" },
  },
  {
    name: "S3 Storage - Use your AWS credentials",
    output_connections: [{ type: "s3", label: "s3" }],
    output_identity_provider: { type: "passthrough", params: "{\"strategy\":\"username_and_password\"}" },
    output_attribute_mapping: { related_backend: "s3", params: "{\"s3\":{\"type\":\"s3\",\"access_key_id\":\"{{ .user }}\",\"secret_access_key\":\"{{ .password }}\"}}" },
    isOK: { storage: "s3", auth: "passthrough" },
  },
  {
    name: "S3 Storage - Multiple users",
    input_storage: ["access_key_id", "secret_access_key"],
    output_connections: [{ type: "s3", label: "s3" }],
    output_identity_provider: { type: "local", params: "{}" },
    output_attribute_mapping: { related_backend: "s3", params: "{\"s3\":{\"type\":\"s3\",\"access_key_id\":\"[[access_key_id]]\",\"secret_access_key\":\"[[secret_access_key]]\"}}" },
    isOK: { storage: "s3", auth: "local" },
  },
  {
    name: "FTP Storage - WordPress Users",
    input_storage: ["ftp_hostname", "ftp_username", "ftp_password"],
    input_auth: ["wordpress_url"],
    output_connections: [{ type: "ftp", label: "ftp" }],
    output_identity_provider: { type: "wordpress", params: "{\"url\":\"[[wordpress_url]]\"}" },
    output_attribute_mapping: { related_backend: "ftp", params: "{\"ftp\":{\"type\":\"ftp\",\"hostname\":\"[[ftp_hostname]]\",\"username\":\"[[ftp_username]]\",\"password\":\"[[ftp_password]]\"}}" },
    isOK: { storage: "ftp", auth: "wordpress" },
  },
]

// Display text is built on demand: the language is not loaded when this module is imported.
const NAMES: Record<string, () => string> = {
  "Local files - just for me": () => t("Local files - just for me"),
  "Local Storage - Local Users": () => t("Local Storage - Local Users"),
  "SFTP Storage - Use existing credentials": () => t("SFTP Storage - Use existing credentials"),
  "S3 Storage - Use your AWS credentials": () => t("S3 Storage - Use your AWS credentials"),
  "S3 Storage - Multiple users": () => t("S3 Storage - Multiple users"),
  "FTP Storage - WordPress Users": () => t("FTP Storage - WordPress Users"),
}

export const presetName = (p: Preset): string => NAMES[p.name]?.() ?? p.name

// HTML for the toast: the links are hard-coded constants, never user input.
export function presetSuccess(p: Preset): string {
  const login = '<a class="wavy" href="login">/login</a>'
  const users = '<a class="wavy" href="admin/simple-user-management">/admin/simple-user-management</a>'
  let text: string
  switch (p.name) {
    case "Local files - just for me":
      text = t("Ready! Visit {{LINK}} with your admin password to start browsing files.", { LINK: login })
      break
    case "Local Storage - Local Users":
      text = t("Applied! Create your first users from {{LINK}}", { LINK: users })
      break
    case "SFTP Storage - Use existing credentials":
      text = t("Done! Visit {{LINK}} and authenticate with your SFTP username and password or private key.", { LINK: login })
      break
    case "S3 Storage - Use your AWS credentials":
      text = t("All set! Visit {{LINK}} - use your access_key_id as username, secret_access_key as password.", { LINK: login })
      break
    case "S3 Storage - Multiple users":
      text = t("All set! Create your first users from {{LINK}}", { LINK: users })
      break
    default:
      text = t("Done! Visit {{LINK}} - use your wordpress credentials to access your FTP.", { LINK: login })
  }
  return `<span>${text}</span>`
}

export const presetFields = (p: Preset): string[] => [...(p.input_storage ?? []), ...(p.input_auth ?? [])]

export function presetAvailable(p: Preset, backends: Record<string, unknown>, auths: Record<string, unknown>): boolean {
  return !!backends[p.isOK.storage] && !!auths[p.isOK.auth]
}

// The values land inside JSON strings, so they are escaped as JSON string contents.
const fill = (text: string, name: string, value: string) =>
  text.replaceAll(`[[${name}]]`, () => JSON.stringify(value).slice(1, -1))

export function applyPresetInputs(p: Preset, inputs: Record<string, string>, adminPassword?: string): PresetOutput {
  const values: Record<string, string> = { ...inputs }
  if (adminPassword !== undefined) values.admin_password = adminPassword
  let identity = p.output_identity_provider.params
  let mapping = p.output_attribute_mapping.params
  for (const [name, value] of Object.entries(values)) {
    identity = fill(identity, name, value)
    mapping = fill(mapping, name, value)
  }
  return {
    connections: structuredClone(p.output_connections),
    identity_provider: { type: p.output_identity_provider.type, params: identity },
    attribute_mapping: { related_backend: p.output_attribute_mapping.related_backend, params: mapping },
  }
}

export type Check = {
  key: "https" | "user" | "storage" | "support" | "license"
  nameSuccess: string
  nameFailure: string
  pass: boolean
  severe: boolean
  message: string
}

export type HealthContext = { protocol: string; user: string; license: string; connections: number }

export function healthChecks(ctx: HealthContext): Check[] {
  return [
    {
      key: "https",
      nameSuccess: t("You're using HTTPS"),
      nameFailure: t("Your connection isn't encrypted"),
      pass: ctx.protocol !== "http:",
      severe: true,
      message: t("Set up HTTPS to secure your connection and protect your data in transit"),
    },
    {
      key: "user",
      nameSuccess: t("Running as non root user: '{{VALUE}}'", ctx.user),
      nameFailure: t("Running as root"),
      pass: ctx.user !== "root",
      severe: true,
      message: t("You should run as a non-privileged user, running as root is risky."),
    },
    {
      key: "storage",
      nameSuccess: "",
      nameFailure: ctx.connections === 0 ? t("Almost there!") : t("Want to try something different?"),
      pass: false,
      severe: ctx.connections === 0,
      message: t("Pick a preset that best fits your needs:"),
    },
    {
      key: "support",
      nameSuccess: t("Enterprise Support: active"),
      nameFailure: t("Enterprise Support: no"),
      pass: ctx.license !== "agpl",
      severe: false,
      message: t("Need guaranteed response times? Upgrade to a support plan with 9x5 or 24x7 coverage and SLAs"),
    },
    {
      key: "license",
      nameSuccess: t("Enterprise License: active"),
      nameFailure: t("You're on the AGPL version"),
      pass: ctx.license !== "agpl",
      severe: false,
      message: t("Upgrade to Filestash enterprise for production usage in a commercial environment"),
    },
  ]
}
