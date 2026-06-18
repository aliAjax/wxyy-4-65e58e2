const { test, expect } = require("@playwright/test");

test.describe("锣鼓经排练工具 · 冒烟测试", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForSelector("#grid");
    await page.evaluate(() => {
      localStorage.clear();
      location.reload();
    });
    await page.waitForSelector("#grid");
  });

  test("页面加载：标题与核心 DOM 元素就绪", async ({ page }) => {
    await expect(page).toHaveTitle(/传统戏曲锣鼓经排练可视化/);
    await expect(page.locator("h1")).toContainText("传统戏曲锣鼓经排练可视化");
    await expect(page.locator("#playBtn")).toBeVisible();
    await expect(page.locator("#stopBtn")).toBeVisible();
    await expect(page.locator("#grid")).toBeVisible();
    await expect(page.locator("#sectionsList")).toBeVisible();
    await expect(page.locator("#commandInput")).toBeVisible();
  });

  test("口令解析预览：输入口令 → 点击解析 → 预览区域可见", async ({ page }) => {
    await page.fill("#commandInput", "仓 才 仓 才 || 冬 台 冬 台");
    await page.click("#parseBtn");
    await expect(page.locator("#importPreview")).toBeVisible();
    await expect(page.locator("#previewGrid")).toBeVisible();
  });

  test("保存方案：点击保存 → 已存方案列表出现条目", async ({ page }) => {
    await expect(page.locator("#savedList")).toBeVisible();
    const beforeCount = await page.locator("#savedList .saved-item").count();
    page.on("dialog", (dialog) => dialog.accept());
    await page.click("#saveBtn");
    await page.waitForTimeout(500);
    const afterCount = await page.locator("#savedList .saved-item").count();
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  test("导出方案：点击导出 → 触发下载", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await page.click("#schemeExportBtn");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test("打开错拍诊断：点击按钮 → 诊断面板显示", async ({ page }) => {
    await expect(page.locator("#diagnosisPanel")).toBeHidden();
    await page.click("#diagnosisToggleBtn");
    await expect(page.locator("#diagnosisPanel")).toBeVisible();
    await expect(page.locator("#diagnosisPanel h2")).toContainText("错拍诊断");
  });

  test("打开排练复盘：点击按钮 → 复盘浮层或提示出现", async ({ page }) => {
    const hasRehearsalLog = await page.evaluate(() => {
      const raw = localStorage.getItem("wxyy-4-rehearsal-log");
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0;
      } catch {
        return false;
      }
    });

    if (hasRehearsalLog) {
      await page.click("#rehearsalReviewBtn");
      await expect(page.locator("#reviewOverlay")).toBeVisible();
    } else {
      page.on("dialog", (dialog) => {
        expect(dialog.message()).toContain("暂无排练记录");
        dialog.accept();
      });
      await page.click("#rehearsalReviewBtn");
    }
  });

  test("协作合并弹窗：点击合并按钮 → 合并浮层出现", async ({ page }) => {
    await expect(page.locator("#mergeOverlay")).toBeHidden();
    await page.click("#schemeMergeBtn");
    await page.waitForTimeout(500);
    await expect(page.locator("#mergeOverlay")).toBeVisible();
    await expect(page.locator("#mergeOverlay h2")).toContainText("协作合并");
  });
});
