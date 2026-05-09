import { initDriver } from "./driver.js";
import { initPassenger } from "./passenger.js";
import { initBuilder } from "./builder.js";

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") || "builder";

const app = document.getElementById("app");

switch (mode) {
  case "driver":
    initDriver(app, {
      terminal: params.get("terminal"),
      room: params.get("room") || "default",
    });
    break;
  case "passenger":
    initPassenger(app, {
      room: params.get("room") || "default",
    });
    break;
  case "builder":
  default:
    initBuilder(app);
    break;
}
