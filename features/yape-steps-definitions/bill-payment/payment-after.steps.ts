import { toggleYapeoAlto } from "@utils/bill-payment/yapeo-alto.helper.ts";
import { scenarioSession } from "@utils/ScenarioSession.ts";
import { After } from "@wdio/cucumber-framework";

After({ tags: "@TC-5727" }, async () => {
    const user = scenarioSession.getUser();
    await toggleYapeoAlto(user.emailHash, 500);
});
