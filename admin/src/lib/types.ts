export type FormElement = { label: string; type: string; description?: string; placeholder?: string; options?: string[]; target?: string[]; readonly: boolean; default: unknown; value: unknown; multi?: boolean; datalist?: string[]; required: boolean; id?: string };
export type Schema = { [key: string]: Schema | FormElement };
export type Connection = { type: string; label: string; [pinned: string]: unknown };
export type Step = { name: string; params?: Record<string, string> };
export type HistoryItem = { id: number | string; created_at: string; status: string; steps: string };
export type Workflow = { id: string; name: string; published: boolean; trigger: Step; actions: Step[]; updated_at?: string; created_at?: string; history?: HistoryItem[] };
export type StepSpec = { name: string; title: string; subtitle?: string; icon: string; specs: Schema };
