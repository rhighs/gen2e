import { compile }from './src/pw-compiler'
import { fetchStatic, makeIdent }from './src/static-store'

const source = `
test(
  "inputs ciao in the search box, clicks button 10 times, and checks count",
  gen.test(async ({ page, gen }) => {
    test.setTimeout(300000);
    await gen(
      "navigate to the login page https://prolocal.mywellness.com:12443/auth/login",
      { page, test }
    );
    await gen("wait for network to be idle", { page, test });
    await gen('type "runner@e2e.it" into the email input field', {
      page,
      test,
    });
    await gen('type "tgsTGS123" into the password input field', { page, test });
    const usernameHelperText = await gen("get the username helper text", {
      page,
      test,
    });
    expect(usernameHelperText).not.toMatch(/[a-zA-Z]/);
    const passwordHelperText = await gen("get the password helper text", {
      page,
      test,
    });
    expect(passwordHelperText).not.toMatch(/[a-zA-Z]/);
    await gen("click the login button", { page, test });
    await gen("click on Test Automation single club", { page, test });
    await gen("click on the left tab item with id automation", { page, test });
    await gen("click on the Campaign item with id automationCampaigns", {
      page,
      test,
    });
    await gen("click the button with data-testid create-campaign-action", {
      page,
      test,
    });
    await gen("wait for at least two seconds so that the modal appears", {
      page,
      test,
    });
    await gen('click the last div with inner text "Notifica push"', {
      page,
      test,
    });
    await gen('click the button that says "Crea"', { page, test });
    await gen("wait for at least one second", { page, test });
    await gen("wait for network to be idle", { page, test });
    await gen('click the button that says "Salva"', { page, test });
  })
);
`;

console.log(compile(source, {
  fetchStatic: (title, task) => fetchStatic(makeIdent(title, task))!.expression
}))

