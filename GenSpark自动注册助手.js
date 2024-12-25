// ==UserScript==
// @name         GenSpark自动注册助手
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  自动完成GenSpark的注册流程，包括登录、邮箱验证和手机验证
// @author       You
// @match        https://login.genspark.ai/gensparkad.onmicrosoft.com/b2c_1_new_login/oauth2/v2.0/*
// @match        https://login.genspark.ai/gensparkad.onmicrosoft.com/B2C_1_new_login/api*
// @match        https://www.genspark.ai/invite*
// @grant        GM_xmlhttpRequest
// @grant        GM_cookie
// @grant        GM.deleteValue
// @grant        GM.setValue
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // 配置项
    const CONFIG = {
        PASSWORD: "123456aA",  // 注册时使用的密码
        EMAIL_API: {
            BASE_URL: "你的邮箱API域名",  // 替换为你的邮箱API域名
            AUTH_KEY: "你的API密钥",      // 替换为你的API密钥
            DOMAIN: "你的邮箱域名"        // 替换为你的邮箱域名
        }
    };

    // 通用工具函数
    function generateRandomString(length) {
        const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    // 第一阶段：登录页面自动点击
    function handleLoginPage() {
        function clickButtons() {
            const waitForLoginButton = setInterval(() => {
                const loginButton = document.getElementById('loginWithEmailWrapper');
                if (loginButton) {
                    loginButton.click();
                    clearInterval(waitForLoginButton);

                    setTimeout(() => {
                        const signupLink = Array.from(document.getElementsByTagName('a')).find(a =>
                            a.textContent.includes('Sign up now')
                        );
                        if (signupLink) {
                            signupLink.click();
                        }
                    }, 1000);
                }
            }, 500);

            setTimeout(() => clearInterval(waitForLoginButton), 10000);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(clickButtons, 1000));
        } else {
            setTimeout(clickButtons, 1000);
        }
    }

    // 第二阶段：邮箱注册相关函数
    async function createNewEmail() {
        const randomName = generateRandomString(8);
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: `${CONFIG.EMAIL_API.BASE_URL}/admin/new_address`,
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-auth": CONFIG.EMAIL_API.AUTH_KEY
                },
                data: JSON.stringify({
                    enablePrefix: true,
                    name: randomName,
                    domain: CONFIG.EMAIL_API.DOMAIN
                }),
                timeout: 30000,
                onload: function(response) {
                    if (response.status === 200) {
                        try {
                            const data = JSON.parse(response.responseText);
                            const emailAddress = `${randomName}@${CONFIG.EMAIL_API.DOMAIN}`;
                            resolve({jwt: data.jwt, email: emailAddress});
                        } catch (e) {
                            reject(e);
                        }
                    } else {
                        reject(new Error(`创建邮箱失败: ${response.status}`));
                    }
                },
                onerror: reject
            });
        });
    }

    // 检查邮件获取验证码
    async function checkEmails(jwt) {
        return new Promise((resolve, reject) => {
            console.log('开始检查邮件, JWT:', jwt);
            GM_xmlhttpRequest({
                method: "GET",
                url: `${CONFIG.EMAIL_API.BASE_URL}/api/mails?limit=1&offset=0`,
                headers: {
                    "Authorization": `Bearer ${jwt}`,
                    "Content-Type": "application/json"
                },
                timeout: 30000,
                onload: function(response) {
                    console.log('收到邮件响应:', response.status);
                    if (response.status === 200) {
                        try {
                            const data = JSON.parse(response.responseText);
                            if (!data.results || data.results.length === 0) {
                                console.log('暂无邮件');
                                resolve(null);
                                return;
                            }
                            const latestMail = data.results[0];
                            const text = latestMail.raw || '';

                            const codeMatch = text.match(/code is: (\d{6})/);
                            if (codeMatch) {
                                const verificationCode = codeMatch[1];
                                console.log('成功提取验证码:', verificationCode);
                                resolve(verificationCode);
                            } else {
                                console.log('邮件中未找到验证码');
                                resolve(null);
                            }
                        } catch (e) {
                            console.error('解析邮件失败:', e);
                            reject(e);
                        }
                    } else {
                        reject(new Error(`获取邮件失败: ${response.status}`));
                    }
                },
                onerror: reject
            });
        });
    }

    // 轮询检查邮件
    async function pollEmails(jwt) {
        let attempts = 0;
        const maxAttempts = 12;
        
        const poll = async () => {
            if (attempts >= maxAttempts) {
                console.log('达到最大尝试次数');
                return;
            }
            
            try {
                const code = await checkEmails(jwt);
                if (code) {
                    fillEmailVerificationCode(code);
                    return;
                }
                attempts++;
                setTimeout(poll, 10000);
            } catch (error) {
                console.error('检查邮件失败:', error);
                attempts++;
                setTimeout(poll, 10000);
            }
        };
        
        await poll();
    }

    // 填写邮箱验证码
    function fillEmailVerificationCode(code) {
        const codeInput = document.querySelector('#emailVerificationCode');
        if (codeInput) {
            codeInput.removeAttribute('disabled');
            codeInput.value = code;
            codeInput.dispatchEvent(new Event('input', { bubbles: true }));

            const verifyButton = document.querySelector('#emailVerificationControl_but_verify_code');
            if (verifyButton) {
                setTimeout(() => {
                    verifyButton.click();
                    console.log('已点击验证按钮');

                    setTimeout(() => {
                        const createButton = document.querySelector('#continue[type="submit"][form="attributeVerification"]');
                        if (createButton) {
                            createButton.removeAttribute('aria-disabled');
                            createButton.click();
                            console.log('已点击Create按钮');
                        }
                    }, 1000);
                }, 1000);
            }
        }
    }

    // 填写手机号码
    function fillPhoneNumber(phoneNumber) {
        const vtiInput = document.querySelector('.vti__input');
        if (vtiInput) {
            // 选择香港区号
            const countrySelector = document.querySelector('.vti__dropdown');
            if (countrySelector) {
                countrySelector.click();
                setTimeout(() => {
                    const hkOption = Array.from(document.querySelectorAll('.vti__dropdown-item')).find(
                        item => item.textContent.includes('Hong Kong') || item.textContent.includes('香港')
                    );
                    if (hkOption) {
                        hkOption.click();
                    }
                }, 500);
            }

            // 填写电话号码
            setTimeout(() => {
                vtiInput.value = phoneNumber;
                vtiInput.dispatchEvent(new Event('input', { bubbles: true }));
                vtiInput.dispatchEvent(new Event('change', { bubbles: true }));

                // 发送验证码
                setTimeout(() => {
                    sendVerificationCode(phoneNumber);
                }, 1000);
            }, 1000);
        }
    }

    // 填写手机验证码
    function fillVerificationCode(code) {
        const verificationInput = document.getElementById('verification_code');
        if (verificationInput) {
            verificationInput.value = code;
            verificationInput.dispatchEvent(new Event('input', { bubbles: true }));
            verificationInput.dispatchEvent(new Event('change', { bubbles: true }));

            setTimeout(() => {
                const submitButton = Array.from(document.querySelectorAll('button')).find(
                    button => button.textContent.includes('领取会员权益')
                );
                if (submitButton) {
                    submitButton.click();
                }
            }, 500);
        }
    }

    // 填写注册表单
    async function fillForm() {
        try {
            const {jwt, email} = await createNewEmail();
            console.log('获取到的JWT:', jwt);

            const emailInput = document.querySelector('input[type="email"]');
            if(emailInput) {
                emailInput.value = email;
                emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('已填写邮箱:', email);

                // 填写密码
                const newPasswordInput = document.querySelector('input[placeholder="New Password"]');
                const confirmPasswordInput = document.querySelector('input[placeholder="Confirm New Password"]');

                if (newPasswordInput && confirmPasswordInput) {
                    newPasswordInput.value = CONFIG.PASSWORD;
                    confirmPasswordInput.value = CONFIG.PASSWORD;
                    newPasswordInput.dispatchEvent(new Event('input', { bubbles: true }));
                    confirmPasswordInput.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // 发送验证码
                setTimeout(() => {
                    const sendCodeButton = document.querySelector('#emailVerificationControl_but_send_code');
                    if(sendCodeButton) {
                        sendCodeButton.click();
                        pollEmails(jwt);
                    }
                }, 1000);
            }
        } catch (error) {
            console.error('填写表单失败:', error);
        }
    }

    // 第三阶段：手机验证相关函数
    function generateHKPhoneNumber() {
        const prefix = ['5', '6', '9'][Math.floor(Math.random() * 3)];
        const number = Math.floor(Math.random() * 9000000) + 1000000;
        return `+852 ${prefix}${number}`;
    }

    function sendVerificationCode(phoneNumber) {
        fetch('https://www.genspark.ai/api/phone/sms_send_verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                number_without_country_code: phoneNumber,
                country_code: '852'
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data && data.code) {
                const verificationInput = document.getElementById('verification_code');
                if (verificationInput) {
                    verificationInput.value = data.code;
                    verificationInput.dispatchEvent(new Event('input', { bubbles: true }));

                    setTimeout(() => {
                        const submitButtons = Array.from(document.querySelectorAll('button')).filter(button =>
                            button.textContent.includes('领取会员权益')
                        );
                        if (submitButtons.length > 0) {
                            submitButtons[0].click();
                            
                            // 清理数据并关闭
                            setTimeout(() => {
                                GM_cookie.list({ domain: 'genspark.ai' }, function(cookies) {
                                    cookies.forEach(function(cookie) {
                                        GM_cookie.delete({
                                            name: cookie.name,
                                            domain: 'genspark.ai'
                                        });
                                    });
                                });
                                localStorage.clear();
                                sessionStorage.clear();
                                window.close();
                            }, 3000);
                        }
                    }, 500);
                }
            }
        });
    }

    // 根据URL判断当前阶段并执行相应函数
    const currentURL = window.location.href;
    if (currentURL.includes('b2c_1_new_login/oauth2/v2.0')) {
        handleLoginPage();
    } else if (currentURL.includes('B2C_1_new_login/api')) {
        fillForm();
    } else if (currentURL.includes('genspark.ai/invite')) {
        // 拦截XHR请求
        const originalXHR = window.XMLHttpRequest;
        window.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const originalOpen = xhr.open;
            xhr.open = function() {
                if (arguments[1].includes('/api/phone/sms_send_verification')) {
                    xhr.addEventListener('load', function() {
                        try {
                            const response = JSON.parse(this.responseText);
                            if (response && response.code) {
                                fillVerificationCode(response.code);
                            }
                        } catch (e) {
                            console.error('解析响应失败:', e);
                        }
                    });
                }
                originalOpen.apply(this, arguments);
            };
            return xhr;
        };
        
        setTimeout(() => {
            const phoneNumber = generateHKPhoneNumber().replace('+852 ', '');
            fillPhoneNumber(phoneNumber);
        }, 1000);
    }
})(); 