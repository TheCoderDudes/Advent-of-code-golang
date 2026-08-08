import { expect, test, type Page } from '@playwright/test'

const SUITE = 'Wynn Las Vegas, 3131 S Las Vegas Blvd, Las Vegas, NV 89109'
const LVCC = 'Las Vegas Convention Center, 3150 Paradise Rd, Las Vegas, NV 89109'

/** Today in show time, so the imported day is the day the app opens on. */
const showToday = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

const csvFor = (date: string) =>
  [
    'Date,Time,Account,Contact,Phone,Party Size,Pickup Location,Duration,Notes',
    // Three accounts in the same 8:00 slot, with staggered meeting lengths.
    `${date},8:00 AM,Denim Republic,Marcus Hale,(702) 555-0118,2,"${LVCC}",60,`,
    `${date},8:00 AM,Westgate Apparel,Priya Nandi,702-555-0142,2,"${LVCC}",90,`,
    `${date},8:00 AM,Coast & Canyon,Dee Alvarez,+17025550176,2,"${LVCC}",120,`,
    // Oversized party, on its own.
    `${date},10:30 AM,Sunbelt Outfitters,Ray Chen,7025550193,7,"${LVCC}",60,`,
    // A different pickup address, to exercise multi-stop routing after a merge.
    `${date},1:00 PM,Harbor Goods,Lena Cross,702 555 0164,1,Bellagio Valet,60,`,
    // No phone at all — call/text must disable rather than crash.
    `${date},3:00 PM,Ellis & Fox,Sam Ellis,,2,"${LVCC}",60,`,
    // Deliberately unparseable, to prove the preview calls it out.
    `${date},whenever,Bad Row Co,Nobody,7025550100,2,"${LVCC}",60,`,
  ].join('\n')

const importCsv = async (page: Page, date: string) => {
  await page.getByTestId('tab-import').click()
  await page.getByTestId('csv-input').setInputFiles({
    name: 'day.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvFor(date)),
  })
}

const setSuiteAddress = async (page: Page) => {
  await page.getByTestId('tab-settings').click()
  await page.getByTestId('suite-address').fill(SUITE)
  await expect(page.getByTestId('suite-address')).toHaveValue(SUITE)
}

/** Every run block on the Day timeline going one direction. */
const timelineRuns = (page: Page, direction: 'toSuite' | 'toConventionCenter') =>
  page.locator(`[data-testid^="timeline-run-"][data-direction="${direction}"]`)

test.describe('full driving day', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('import, group, split, merge, drive and close out a run', async ({ page }) => {
    const date = showToday()

    // --- import ----------------------------------------------------------
    await setSuiteAddress(page)
    await importCsv(page, date)

    await expect(page.getByTestId('import-preview')).toBeVisible()
    await expect(page.getByTestId('import-preview')).toContainText('6 rows ready')
    await expect(page.getByTestId('import-issues')).toContainText('unreadable time "whenever"')

    await page.getByTestId('import-replace').click()
    await expect(page.getByTestId('screen-now')).toBeVisible()

    // --- auto-grouping ---------------------------------------------------
    await expect(page.getByTestId('run-heads')).toHaveText('3 accounts · 6 people')
    await expect(page.getByTestId('run-card-' + (await activeRunId(page)))).toContainText('PICK UP')

    await page.getByTestId('tab-day').click()
    await expect(timelineRuns(page, 'toSuite')).toHaveCount(4)
    await expect(page.getByTestId('runs-left')).toHaveText('10')
    await expect(page.getByTestId('accounts-left')).toHaveText('6')
    // The three 8:00 accounts ride in together...
    const eightAm = timelineRuns(page, 'toSuite').first()
    await expect(eightAm).toContainText('Denim Republic')
    await expect(eightAm).toContainText('Westgate Apparel')
    await expect(eightAm).toContainText('Coast & Canyon')

    // ...but leave separately at 9:00, 9:30 and 10:00.
    const returns = timelineRuns(page, 'toConventionCenter')
    await expect(returns).toHaveCount(6)
    await expect(returns.nth(0)).toContainText('9:00 AM')
    await expect(returns.nth(0)).toContainText('Denim Republic')
    await expect(returns.nth(1)).toContainText('9:30 AM')
    await expect(returns.nth(1)).toContainText('Westgate Apparel')
    await expect(returns.nth(2)).toContainText('10:00 AM')
    await expect(returns.nth(2)).toContainText('Coast & Canyon')

    // --- capacity warning -------------------------------------------------
    const oversized = timelineRuns(page, 'toSuite').nth(1)
    await expect(oversized).toContainText('Sunbelt Outfitters')
    await expect(oversized).toContainText('Over capacity: 7 people vs 6 seats')

    // --- split, then merge back, losing nobody -----------------------------
    await page.getByTestId('tab-now').click()
    await page.getByTestId('more-' + (await appointmentId(page, 'Westgate Apparel'))).click()
    await page.getByTestId('split-out').click()

    await page.getByTestId('tab-day').click()
    await expect(timelineRuns(page, 'toSuite')).toHaveCount(5)
    // One more run to drive, but not one account gained or lost.
    await expect(page.getByTestId('runs-left')).toHaveText('11')
    await expect(page.getByTestId('accounts-left')).toHaveText('6')
    expect(await countOf(page, 'Westgate Apparel', 'toSuite')).toBe(1)

    const splitRunId = await runIdContaining(page, 'toSuite', 'Westgate Apparel')
    await page.getByTestId(`merge-open-${splitRunId}`).click()
    const mergeTarget = await runIdContaining(page, 'toSuite', 'Denim Republic')
    await page.getByTestId(`merge-into-${mergeTarget}`).click()

    await expect(timelineRuns(page, 'toSuite')).toHaveCount(4)
    expect(await countOf(page, 'Westgate Apparel', 'toSuite')).toBe(1)
    const remerged = timelineRuns(page, 'toSuite').first()
    await expect(remerged).toContainText('Denim Republic')
    await expect(remerged).toContainText('Westgate Apparel')
    await expect(remerged).toContainText('Coast & Canyon')

    // --- drive the run ----------------------------------------------------
    await page.getByTestId('tab-now').click()
    const runId = await activeRunId(page)
    const card = page.getByTestId(`run-card-${runId}`)

    await expect(page.getByTestId('primary-action')).toHaveText('Start driving')
    await page.getByTestId('primary-action').click()
    await expect(card).toHaveAttribute('data-run-status', 'driving')

    await expect(page.getByTestId('primary-action')).toHaveText('Arrived')
    await page.getByTestId('primary-action').click()
    await expect(card).toHaveAttribute('data-run-status', 'arrived')

    // Nobody is aboard yet, so the run cannot close.
    await expect(page.getByTestId('primary-action')).toHaveText('Everyone onboard')
    await expect(page.getByTestId('primary-action')).toBeDisabled()

    const denim = await appointmentId(page, 'Denim Republic')
    const westgate = await appointmentId(page, 'Westgate Apparel')
    const coast = await appointmentId(page, 'Coast & Canyon')

    await page.getByTestId(`board-${denim}`).click()
    await page.getByTestId(`board-${westgate}`).click()
    await expect(page.getByTestId('primary-action')).toBeDisabled()

    // The third buyer never showed — leave without them.
    await page.getByTestId(`noshow-${coast}`).click()
    await expect(page.getByTestId(`passenger-${coast}`)).toContainText('No-show')
    await expect(page.getByTestId('run-heads')).toHaveText('2 accounts · 4 people')

    await expect(page.getByTestId('primary-action')).toBeEnabled()
    await page.getByTestId('primary-action').click()
    await expect(card).toHaveAttribute('data-run-status', 'onboard')

    await expect(page.getByTestId('primary-action')).toHaveText('Complete')
    await page.getByTestId('primary-action').click()

    // --- the no-show's return run is gone, and the app said so -------------
    await expect(page.locator('body')).toContainText('Return run for Coast & Canyon removed')
    await page.getByTestId('tab-day').click()
    expect(await countOf(page, 'Coast & Canyon', 'toConventionCenter')).toBe(0)
    await expect(timelineRuns(page, 'toConventionCenter')).toHaveCount(5)
    // Their pickup manifest still records what happened.
    expect(await countOf(page, 'Coast & Canyon', 'toSuite')).toBe(1)
  })

  test('navigation, call and text links are built correctly', async ({ page }) => {
    const date = showToday()
    await setSuiteAddress(page)
    await importCsv(page, date)
    await page.getByTestId('import-replace').click()

    // Pickup run, nobody aboard: drive to the convention center, single stop,
    // so the native scheme is used.
    const navUrl = await page.getByTestId('navigate').getAttribute('data-nav-url')
    expect(navUrl).toBe(
      `comgooglemaps://?daddr=${encodeURIComponent(LVCC)}&directionsmode=driving`,
    )
    expect(await page.getByTestId('navigate').getAttribute('data-nav-web-url')).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(LVCC)}&travelmode=driving`,
    )

    // Once everyone is aboard, the same button points at the suite.
    await page.getByTestId('primary-action').click() // start driving
    await page.getByTestId('primary-action').click() // arrived
    for (const account of ['Denim Republic', 'Westgate Apparel', 'Coast & Canyon']) {
      await page.getByTestId(`board-${await appointmentId(page, account)}`).click()
    }
    await page.getByTestId('primary-action').click() // everyone onboard
    expect(await page.getByTestId('navigate').getAttribute('data-nav-url')).toBe(
      `comgooglemaps://?daddr=${encodeURIComponent(SUITE)}&directionsmode=driving`,
    )

    // tel: links come straight off the normalised phone number.
    const denim = await appointmentId(page, 'Denim Republic')
    expect(await page.getByTestId(`call-${denim}`).getAttribute('data-tel-url')).toBe(
      'tel:+17025550118',
    )

    // The ETA sheet drops the chosen number into the template.
    await page.getByTestId('text-everyone').click()
    await page.getByTestId('template-etaConventionCenter').click()
    await page.getByTestId('eta-15').click()
    const smsUrl = await page.getByTestId(`send-sms-${denim}`).getAttribute('data-sms-url')
    expect(smsUrl).toContain('sms:+17025550118&body=')
    expect(decodeURIComponent(smsUrl!.split('&body=')[1])).toContain('about 15 minutes out')
    // Every account in the run gets its own message to tap through.
    await expect(page.locator('[data-testid^="send-sms-"]')).toHaveCount(3)
  })

  test('a run with two pickup addresses routes through waypoints', async ({ page }) => {
    const date = showToday()
    await setSuiteAddress(page)
    await importCsv(page, date)
    await page.getByTestId('import-replace').click()

    // Put the Bellagio pickup in the same run as the convention centre one.
    await page.getByTestId('tab-day').click()
    const harbor = await runIdContaining(page, 'toSuite', 'Harbor Goods')
    await page.getByTestId(`merge-open-${harbor}`).click()
    const sunbelt = await runIdContaining(page, 'toSuite', 'Sunbelt Outfitters')
    await page.getByTestId(`merge-into-${sunbelt}`).click()
    await page.getByTestId(`make-active-${sunbelt}`).click()

    const navButton = page.getByTestId('navigate')
    // Two stops, so no app scheme: comgooglemaps:// can't do waypoints.
    expect(await navButton.getAttribute('data-nav-url')).toBe(
      await navButton.getAttribute('data-nav-web-url'),
    )
    const webUrl = await navButton.getAttribute('data-nav-web-url')
    expect(webUrl).toContain('destination=Bellagio%20Valet')
    expect(webUrl).toContain(`waypoints=${encodeURIComponent(LVCC)}&`)
    expect(webUrl).toContain('travelmode=driving')
    await expect(page.getByTestId('run-card-' + sunbelt)).toContainText('2-stop route')
  })

  test('an account with no phone disables call and text instead of crashing', async ({ page }) => {
    const date = showToday()
    await setSuiteAddress(page)
    await importCsv(page, date)
    await page.getByTestId('import-replace').click()

    await page.getByTestId('tab-day').click()
    const runId = await runIdContaining(page, 'toSuite', 'Ellis & Fox')
    await page.getByTestId(`make-active-${runId}`).click()

    const ellis = await appointmentId(page, 'Ellis & Fox')
    await expect(page.getByTestId(`passenger-${ellis}`)).toContainText('No usable phone number')
    await expect(page.getByTestId(`call-${ellis}`)).toBeDisabled()
    await expect(page.getByTestId(`text-${ellis}`)).toBeDisabled()
    await expect(page.getByTestId('call-run')).toBeDisabled()
    await expect(page.getByTestId('text-everyone')).toBeDisabled()
    // Navigation still works for them.
    await expect(page.getByTestId('navigate')).toBeEnabled()
  })

  test('state survives a reload', async ({ page }) => {
    const date = showToday()
    await setSuiteAddress(page)
    await importCsv(page, date)
    await page.getByTestId('import-replace').click()

    await page.getByTestId('primary-action').click()
    await page.getByTestId('run-notes').fill('Buyer running late, waiting at door 3')

    await page.reload()
    await expect(page.getByTestId('screen-now')).toBeVisible()
    await expect(page.getByTestId('run-notes')).toHaveValue('Buyer running late, waiting at door 3')
    await expect(page.getByTestId('primary-action')).toHaveText('Arrived')
    await expect(page.getByTestId('run-heads')).toHaveText('3 accounts · 6 people')
  })

  test('first open with no data lands on the import screen', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await expect(page.getByTestId('screen-import')).toBeVisible()
    await expect(page.getByText('Import a CSV')).toBeVisible()
  })
})

// --- helpers ---------------------------------------------------------------

const activeRunId = async (page: Page): Promise<string> => {
  const id = await page.locator('[data-testid^="run-card-"]').first().getAttribute('data-testid')
  return id!.replace('run-card-', '')
}

const appointmentId = async (page: Page, accountName: string): Promise<string> => {
  const id = await page
    .locator('[data-testid^="passenger-"]', { hasText: accountName })
    .first()
    .getAttribute('data-testid')
  return id!.replace('passenger-', '')
}

const runIdContaining = async (
  page: Page,
  direction: 'toSuite' | 'toConventionCenter',
  accountName: string,
): Promise<string> => {
  const id = await timelineRuns(page, direction)
    .filter({ hasText: accountName })
    .first()
    .getAttribute('data-testid')
  return id!.replace('timeline-run-', '')
}

/** How many run blocks in a direction list this account — must never exceed 1. */
const countOf = async (
  page: Page,
  accountName: string,
  direction: 'toSuite' | 'toConventionCenter',
): Promise<number> => timelineRuns(page, direction).filter({ hasText: accountName }).count()
