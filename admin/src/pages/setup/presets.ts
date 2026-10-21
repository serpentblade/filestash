import type { Connection } from "$lib/types"

export type Preset = {
  name: string
  // rendered as HTML in the toast: a hard-coded constant (it contains links)
  success: string
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
    success: "<span>Ready! Visit <a class=\"wavy\" href=\"login\">/login</a> with your admin password to start browsing files.</span>",
    output_connections: [{ type: "local", label: "local" }],
    output_identity_provider: { type: "passthrough", params: "{\"strategy\":\"password_only\"}" },
    output_attribute_mapping: { related_backend: "local", params: "{\"local\":{\"type\":\"local\",\"password\":\"{{ .password }}\"}}" },
    isOK: { storage: "local", auth: "passthrough" },
  },
  {
    name: "Local Storage - Local Users",
    success: "<span>Applied! Create your first users from <a class=\"wavy\" href=\"admin/simple-user-management\">/admin/simple-user-management</a></span>",
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
    success: "<span>Done! Visit <a class=\"wavy\" href=\"login\">/login</a> and authenticate with your SFTP username and password or private key.</span>",
    input_storage: ["sftp_hostname"],
    output_connections: [{ type: "sftp", label: "sftp" }],
    output_identity_provider: { type: "passthrough", params: "{\"strategy\":\"username_and_password\"}" },
    output_attribute_mapping: { related_backend: "sftp", params: "{\"sftp\":{\"type\":\"sftp\",\"hostname\":\"[[sftp_hostname]]\",\"username\":\"{{ .user }}\",\"password\":\"{{ .password }}\"}}" },
    isOK: { storage: "sftp", auth: "passthrough" },
  },
  {
    name: "S3 Storage - Use your AWS credentials",
    success: "<span>All set! Visit <a class=\"wavy\" href=\"login\">/login</a> - use your access_key_id as username, secret_access_key as password.</span>",
    output_connections: [{ type: "s3", label: "s3" }],
    output_identity_provider: { type: "passthrough", params: "{\"strategy\":\"username_and_password\"}" },
    output_attribute_mapping: { related_backend: "s3", params: "{\"s3\":{\"type\":\"s3\",\"access_key_id\":\"{{ .user }}\",\"secret_access_key\":\"{{ .password }}\"}}" },
    isOK: { storage: "s3", auth: "passthrough" },
  },
  {
    name: "S3 Storage - Multiple users",
    success: "<span>All set! Create your first users from <a class=\"wavy\" href=\"admin/simple-user-management\">/admin/simple-user-management</a></span>",
    input_storage: ["access_key_id", "secret_access_key"],
    output_connections: [{ type: "s3", label: "s3" }],
    output_identity_provider: { type: "local", params: "{}" },
    output_attribute_mapping: { related_backend: "s3", params: "{\"s3\":{\"type\":\"s3\",\"access_key_id\":\"[[access_key_id]]\",\"secret_access_key\":\"[[secret_access_key]]\"}}" },
    isOK: { storage: "s3", auth: "local" },
  },
  {
    name: "FTP Storage - WordPress Users",
    success: "<span>Done! Visit <a class=\"wavy\" href=\"login\">/login</a> - use your wordpress credentials to access your FTP.</span>",
    input_storage: ["ftp_hostname", "ftp_username", "ftp_password"],
    input_auth: ["wordpress_url"],
    output_connections: [{ type: "ftp", label: "ftp" }],
    output_identity_provider: { type: "wordpress", params: "{\"url\":\"[[wordpress_url]]\"}" },
    output_attribute_mapping: { related_backend: "ftp", params: "{\"ftp\":{\"type\":\"ftp\",\"hostname\":\"[[ftp_hostname]]\",\"username\":\"[[ftp_username]]\",\"password\":\"[[ftp_password]]\"}}" },
    isOK: { storage: "ftp", auth: "wordpress" },
  },
]

export const presetFields = (p: Preset): string[] => [...(p.input_storage ?? []), ...(p.input_auth ?? [])]

export function presetAvailable(p: Preset, backends: Record<string, unknown>, auths: Record<string, unknown>): boolean {
  return !!backends[p.isOK.storage] && !!auths[p.isOK.auth]
}

// The values land inside JSON strings, hence the quote escaping (as the original intends).
const fill = (text: string, name: string, value: string) =>
  text.replaceAll(`[[${name}]]`, () => value.replaceAll("\"", "\\\""))

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
      nameSuccess: "You're using HTTPS",
      nameFailure: "Your connection isn't encrypted",
      pass: ctx.protocol !== "http:",
      severe: true,
      message: "Set up HTTPS to secure your connection and protect your data in transit",
    },
    {
      key: "user",
      nameSuccess: "Running as non root user: '" + ctx.user + "'",
      nameFailure: "Running as root",
      pass: ctx.user !== "root",
      severe: true,
      message: "You should run as a non-privileged user, running as root is risky.",
    },
    {
      key: "storage",
      nameSuccess: "",
      nameFailure: ctx.connections === 0 ? "Almost there!" : "Want to try something different?",
      pass: false,
      severe: ctx.connections === 0,
      message: "Pick a preset that best fits your needs:",
    },
    {
      key: "support",
      nameSuccess: "Enterprise Support: active",
      nameFailure: "Enterprise Support: no",
      pass: ctx.license !== "agpl",
      severe: false,
      message: "Need guaranteed response times? Upgrade to a support plan with 9x5 or 24x7 coverage and SLAs",
    },
    {
      key: "license",
      nameSuccess: "Enterprise License: active",
      nameFailure: "You're on the AGPL version",
      pass: ctx.license !== "agpl",
      severe: false,
      message: "Upgrade to Filestash enterprise for production usage in a commercial environment",
    },
  ]
}
