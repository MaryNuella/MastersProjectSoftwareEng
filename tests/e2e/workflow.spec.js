import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
test("landing, documentation and authentication boundary", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Design and Implementation",
  );
  await page.getByRole("link", { name: "Open research workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Access your research workspace" }),
  ).toBeVisible();
  const response = await request.get("/api/projects");
  expect([401, 503]).toContain(response.status());
  await page.getByRole("link", { name: "Documentation", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Defence demonstration workflow" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "BVA-DATE", exact: true }),
  ).toBeVisible();
});

test('mobile workspace stays within viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/dashboard');
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test("complete authenticated research workflow and invalid constraint handling", async ({
  page,
}) => {
  test.skip(
    process.env.TEST_ALLOW_DATABASE_WRITES !== "true" ||
      !process.env.TEST_USER_EMAIL ||
      !process.env.TEST_SUPABASE_URL ||
      !process.env.TEST_SUPABASE_PUBLISHABLE_KEY,
    "Requires dedicated Supabase test configuration",
  );
  const db = createClient(
    process.env.TEST_SUPABASE_URL,
    process.env.TEST_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const login = await db.auth.signInWithPassword({
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD,
  });
  expect(login.error).toBeNull();
  await page.goto("/projects");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.TEST_USER_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.TEST_USER_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const title = `TEST-E2E-${Date.now()}`;
  try {
    await page.getByLabel("Project title", { exact: true }).fill(title);
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Project created");
    const project = await db
      .from("projects")
      .select("id")
      .eq("title", title)
      .single();
    expect(
      project.error,
      "App must target the same disposable database as TEST_SUPABASE_URL",
    ).toBeNull();
    await page.getByRole("link", { name: "Requirements", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Password policy");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Required password, 8 to 20 characters");
    await page.getByLabel("Input field name").fill("password");
    await page
      .getByLabel("Constraints (JSON)")
      .fill('{"minLength":20,"maxLength":8}');
    await page.getByRole("button", { name: "Save requirement" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Minimum length exceeds",
    );
    await page
      .getByLabel("Constraints (JSON)")
      .fill('{"minLength":8,"maxLength":20}');
    await page.getByRole("button", { name: "Save requirement" }).click();
    await expect(page.getByRole("status")).toContainText("Requirement saved");
    await page
      .getByRole("link", { name: "Generate cases", exact: true })
      .click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Generate test cases", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Generated and saved");
    await page.getByRole("link", { name: "Validation", exact: true }).click();
    await page
      .getByRole("button", { name: "Validate cases", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Independent validation saved",
    );
    await expect(
      page.getByText("Missing conditions: 0", { exact: false }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Traceability", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Passed", exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "cases · CSV", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe("cases.csv");
    await page.getByRole("link", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: "Reopen session" }).first().click();
    await expect(page.getByRole("status")).toContainText("Session reopened");
  } finally {
    const cleanup = await db.from("projects").delete().eq("title", title);
    expect(cleanup.error).toBeNull();
    await db.auth.signOut();
  }
});
