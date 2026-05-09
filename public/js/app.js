import { initDriver } from "./driver.js";
import { initPassenger } from "./passenger.js";
import { initBuilder } from "./builder.js";

const params = new URLSearchParams(window.location.search);
const path = window.location.pathname;

const app = document.getElementById("app");

if (path === "/builder") {
  initBuilder(app);
} else if (path === "/passenger") {
  initPassenger(app, {
    room: params.get("room") || "default",
  });
} else {
  initDriver(app, {
    terminal: params.get("terminal"),
    room: params.get("room") || "default",
  });
}
