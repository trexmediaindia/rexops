import { serverEnv } from "@rexops/config/env/server";
import { app } from "./app";

const port = serverEnv.API_PORT;

app.listen(port);
console.log(`RexOps API listening on http://localhost:${port}`);
