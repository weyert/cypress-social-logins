/* eslint-disable @typescript-eslint/no-var-requires */
'use strict'

const puppeteer = require('puppeteer')
const OTPAuth = require('otpauth')

/**
 *
 * @param {options.username} string username
 * @param {options.password} string password
 * @param {options.loginUrl} string password
 * @param {options.args} array[string] string array which allows providing further arguments to puppeteer
 * @param {options.loginSelector} string a selector on the loginUrl page for the social provider button
 * @param {options.loginSelectorDelay} number delay a specific amount of time before clicking on the login button, defaults to 250ms. Pass a boolean false to avoid completely.
 * @param {options.postLoginSelector} string a selector on the app's post-login return page to assert that login is successful
 * @param {options.preLoginSelector} string a selector to find and click on before clicking on the login button (useful for accepting cookies)
 * @param {options.headless} boolean launch puppeteer in headless more or not
 * @param {options.logs} boolean whether to log cookies and other metadata to console
 * @param {options.getAllBrowserCookies} boolean whether to get all browser cookies instead of just for the loginUrl
 * @param {options.isPopup} boolean is your google auth displayed like a popup
 * @param {options.popupDelay} number delay a specific milliseconds before popup is shown. Pass a falsy (false, 0, null, undefined, '') to avoid completely
 * @param {options.cookieDelay} number delay a specific milliseconds before get a cookies. Pass a falsy (false, 0, null, undefined, '') to avoid completely.
 *
 */
module.exports.GoogleSocialLogin = async function GoogleSocialLogin(options = {}) {
  validateOptions(options)

  const launchOptions = { headless: !!options.headless }

  if (options.args && options.args.length) {
    console.log(`Custom browser launch arguments passed: `, options.args)
    launchOptions.args = options.args
  }

  const browser = await puppeteer.launch(launchOptions)
  let page = await browser.newPage()
  let originalPageIndex = 1
  await page.setViewport({ width: 1280, height: 800 })

  await page.goto(options.loginUrl)
  console.log(`Attempt to navigate to the login page: ${options.loginUrl}`)

  await login({ page, options })

  // Switch to Popup Window
  if (options.isPopup) {
    if (options.popupDelay) {
      await delay(options.popupDelay)
    }
    const pages = await browser.pages()
    // remember original window index
    originalPageIndex = pages.indexOf(
      pages.find((p) => page._target._targetId === p._target._targetId)
    )
    page = pages[pages.length - 1]
  }

  console.log('Attempt to enter the username')
  await typeUsername({ page, options })
  console.log('Attempt to enter the password')
  await typePassword({ page, options })
  if (options.includeOtpCode) {
    console.log('Attempt to enter the TOTP code')
    await typeOTPCode({ page, options })
  }

  // Switch back to Original Window
  if (options.isPopup) {
    if (options.popupDelay) {
      await delay(options.popupDelay)
    }
    const pages = await browser.pages()
    page = pages[originalPageIndex]
  }

  if (options.cookieDelay) {
    await delay(options.cookieDelay)
  }

  const cookies = await getCookies({ page, options })

  await finalizeSession({ page, browser, options })

  return {
    cookies,
  }
}

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time)
  })
}

function validateOptions(options) {
  if (!options.username || !options.password) {
    throw new Error('Username or Password missing for social login')
  }
}

async function login({ page, options } = {}) {
  console.log('Attempting to login!')
  console.log('Current page: ', page)

  if (options.preLoginSelector) {
    await page.waitForSelector(options.preLoginSelector)
    await page.click(options.preLoginSelector)
  }

  await page.waitForSelector(options.loginSelector)

  if (options.loginSelectorDelay !== false) {
    await delay(options.loginSelectorDelay)
  }

  await page.click(options.loginSelector)
}

async function typeUsername({ page, options } = {}) {
  const buttonSelector = options.headless ? '#next' : '#identifierNext'

  await page.waitForSelector('input[type="email"]')
  await page.type('input[type="email"]', options.username)
  await page.click(buttonSelector)
}

async function typePassword({ page, options } = {}) {
  const buttonSelector = options.headless ? '#signIn' : '#passwordNext'

  await page.waitForSelector('input[type="password"]', { visible: true })
  await page.type('input[type="password"]', options.password)
  await page.waitForSelector(buttonSelector, { visible: true })
  await page.click(buttonSelector)
}

function getNextOtpCode(secret) {
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secret, // or "OTPAuth.Secret.fromB32('NB2W45DFOIZA')"
  })

  // Generate TOTP token.
  const token = totp.generate()
  return token
}

async function typeTOTPCode({ page, options } = {}) {
  console.log('typeTOTPCode()')
  const buttonSelector = options.headless ? '#signIn' : '#totpNext'
  console.log('page: ', page)

  const nextCode = getNextOtpCode(options.otpSecret)
  console.log('Generated code: ', nextCode)

  await page.waitForSelector('input[type="tel"]', { visible: true })
  await page.type('input[type="tel"]', nextCode)
  await page.waitForSelector(buttonSelector, { visible: true })
  await page.click(buttonSelector)
}

async function getCookies({ page, options } = {}) {
  await page.waitForSelector(options.postLoginSelector)

  const cookies = options.getAllBrowserCookies
    ? await getCookiesForAllDomains(page)
    : await page.cookies(options.loginUrl)

  if (options.logs) {
    console.log(cookies)
  }

  return cookies
}

async function getCookiesForAllDomains(page) {
  const cookies = await page._client.send('Network.getAllCookies', {})
  return cookies.cookies
}

async function finalizeSession({ page, browser, options } = {}) {
  await browser.close()
}
