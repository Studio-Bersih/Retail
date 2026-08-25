import { useConfig } from '../config';

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public body?: unknown
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

type Options = RequestInit & {
    /** SvelteKit's fetch, when calling from a load function */
    fetch?: typeof globalThis.fetch;
};

/**
 * Thin wrapper over fetch. Pass SvelteKit's `fetch` from a load function so
 * requests are deduplicated and cookies are forwarded during SSR.
 *
 * The backend answers a refused business rule with a message that is safe to
 * show the user — see Retail-Backend/IMPLEMENTATION.md §2.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
    const { fetch: f = globalThis.fetch, ...init } = options;

    const response = await f(`${useConfig.API_URL}${path}`, {
        ...init,
        headers: {
            Accept: 'application/json',
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...init.headers
        }
    });

    const text = await response.text();
    const body = text ? safeParse(text) : null;

    if (!response.ok) {
        const message =
            (body as { message?: string } | null)?.message ?? `Request failed (${response.status})`;
        throw new ApiError(response.status, message, body);
    }

    return body as T;
}

function safeParse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
