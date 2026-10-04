// POST { action: "signup", id, pin, display_name? } | { action: "login", id, pin }   (id = numeric patient number)
// No sessions: the UI keeps the id in local state and sends it with each call.
import { ValidationError } from "../_shared/domain/errors.ts";
import { makeDeps } from "../_shared/infra/container.ts";
import { handler, requireString } from "../_shared/infra/http.ts";
import { login, signup } from "../_shared/use-cases/auth.ts";

Deno.serve(handler(async (body) => {
  const action = requireString(body, "action");
  const id = requireString(body, "id");
  const pin = requireString(body, "pin");
  const deps = makeDeps();
  if (action === "signup") {
    const name = typeof body.display_name === "string" && body.display_name.trim() ? body.display_name.trim() : null;
    return { patient: await signup({ id, pin, displayName: name }, deps) };
  }
  if (action === "login") return { patient: await login({ id, pin }, deps) };
  throw new ValidationError("action must be signup or login");
}));
