import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
test("create and edit Agent → complete keyless demo → inspect tool results → replay history", async ({
  page,
}) => {
  mkdirSync("docs/evidence", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /创造战士/ })).toBeVisible();
  await expect
    .poll(() => page.getByLabel("己方角色").locator("option").count())
    .toBeGreaterThanOrEqual(4);
  await page.screenshot({
    path: "docs/evidence/home.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "创造战士 →", exact: true }).click();
  const name = `测试骑士-${Date.now()}`;
  await page.getByLabel("角色名称", { exact: true }).fill(name);
  await page
    .getByLabel("自然语言角色描述")
    .fill("人类骑士，擅长长剑与防御，不具备无限能力。");
  await page.getByRole("button", { name: "生成模板草案" }).click();
  await page
    .getByLabel("战术提示词")
    .fill("CUSTOM_E2E_PROMPT 优先冲锋，低生命时使用药剂。");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/evidence/editor.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "保存角色", exact: false })
    .first()
    .click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /我的战士/ })
    .click();
  await page.getByRole("button", { name: `编辑 ${name}`, exact: true }).click();
  await expect(page.getByLabel("战术提示词")).toHaveValue(/CUSTOM_E2E_PROMPT/);
  await page.getByRole("button", { name: "← 返回", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /竞技场/ })
    .click();
  await page
    .getByLabel("己方角色")
    .selectOption({ label: `${name} · 誓约骑士` });
  await page.getByLabel("对手角色").selectOption("ranger");
  await page.getByRole("button", { name: "发起挑战 →", exact: true }).click();
  await expect(page.getByTestId("battlefield")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.getByLabel("回放进度").getAttribute("max")) !== "1",
    )
    .toBe(true);
  await page.getByRole("button", { name: "末尾 ↦", exact: true }).click();
  await expect(page.getByText("✦ 比赛结束", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tool Calls", exact: true }).click();
  await expect(page.getByText("工具执行结果", { exact: true })).toBeVisible();
  await page.getByText("工具执行结果", { exact: true }).click();
  await page.getByRole("button", { name: "战术复盘", exact: true }).click();
  await expect(page.getByText(/基于实际事件统计的复盘/)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/evidence/battle-result.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "回到开始", exact: true }).click();
  await expect(page.getByLabel("回放进度")).toHaveValue("0");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByLabel("回放进度")).toHaveValue("1");
  await page.getByRole("button", { name: "行动时间线", exact: true }).click();
  await page.getByRole("button", { name: "末尾 ↦", exact: true }).click();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const log = document.querySelector(".timeline");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await page.screenshot({
    path: "docs/evidence/battle.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /战斗档案/ })
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/evidence/history.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".history-row").first().click();
  await expect(page.getByLabel("回放进度")).toHaveValue("0");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByLabel("回放进度")).toHaveValue("1");
  expect(errors).toEqual([]);
});
test("editor blocks over-budget saves and absent model key is visible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "创造战士 →", exact: true }).click();
  await page.getByLabel("生命属性", { exact: true }).fill("120");
  await page.getByLabel("攻击属性", { exact: true }).fill("22");
  await expect(
    page.getByRole("button", { name: "保存角色", exact: false }).first(),
  ).toBeDisabled();
  await expect(page.getByText(/能力预算.*请降低/)).toBeVisible();
  await page.getByRole("button", { name: "← 返回", exact: true }).click();
  await page
    .getByRole("button", { name: "✦ Pi LLM Agent", exact: true })
    .click();
  await page.getByRole("button", { name: "发起挑战 →", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("未配置服务端 API Key");
});
