// Host credentials stay with the existing AI pool. The API Worker receives one provider reply at a time.
export function createRegistrationAiGateway(env, {
  AI_PRIORITY, AI_MODELS, createAiClient, createAdapters, createEnvCredentialResolver, runPaidProbe,
}, {fetcher = fetch, timeoutMs = 10000} = {}) {
  const providers = [...new Set([...AI_PRIORITY, ...Object.keys(AI_MODELS)]), 'deepseek'];
  const routes = Object.fromEntries(providers.filter(provider => provider !== 'deepseek').map(provider =>
    ['registration.' + provider, {provider, maxOutputTokens: 2048}]));
  const client = createAiClient({routes, timeoutMs, adapters: createAdapters({fetcher,cloudflareThinking:false}),
    resolveCredential: createEnvCredentialResolver(env)});
  return {
    providers: () => providers,
    async attempt(provider, input) {
      try {
        if (provider === 'deepseek') {
          return {value: await runPaidProbe({env, fetcher, timeoutMs, messages: input.messages,
            maxOutputTokens: input.maxOutputTokens})};
        }
        if (!Object.hasOwn(routes, 'registration.' + provider)) return {error: 'NOT_CONFIGURED'};
        return {value: await client.generate({...input, route: 'registration.' + provider})};
      } catch (error) {
        const {upstreamStatus, providerCode} = error?.diagnostic ?? {};
        return {error: error?.code || 'AI_UNAVAILABLE', model: provider === 'deepseek' ? 'deepseek-flash' : AI_MODELS[provider],
          upstream_status: upstreamStatus, provider_code: providerCode};
      }
    },
  };
}

export function createRegistrationAiEntrypoint(WorkerEntrypoint, dependencies, options) {
  return class RegistrationAi extends WorkerEntrypoint {
    providers() { return createRegistrationAiGateway(this.env, dependencies, options).providers(); }
    attempt(provider, input) { return createRegistrationAiGateway(this.env, dependencies, options).attempt(provider, input); }
  };
}
