<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture decisions

- Public app tables keep RLS enabled with no policies on purpose; only server-side code holding the privileged key reads or writes them. Do not add client-readable policies to "fix" the linter warning.
- AI calls use the user's own provider key held in a project secret (e.g. GROQ_API_KEY), read inside server-side handlers. Never expose it to the browser or commit it; if they later switch providers, keep the same server-only pattern.
