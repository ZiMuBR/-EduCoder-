// ==UserScript==
// @name         头歌(EduCoder)自动刷课脚本
// @namespace    https://www.educoder.net/
// @version      23.0
// @description  头歌(EduCoder)自动刷课脚本
// @author       自牧
// @match        *://www.educoder.net/classrooms/*/video_info*
// @grant        none
// @run-at       document-body
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ====================== 全局状态 ======================
    let state = {
        currentIndex: 1,
        playbackRate: 2, // 默认倍速，可通过悬浮窗修改，最大10倍
        hasPlaySuccess: false,
        playRetryCount: 0,
        videoInitLock: false,
        isJumping: false,
        lastVideoSrc: '',
        panelInited: false
    };

    // ====================== 工具函数 ======================
    const $ = (selector, context = document) => {
        try {
            return context.querySelector(selector);
        } catch (e) {
            return null;
        }
    };
    const $$ = (selector, context = document) => {
        try {
            return Array.from(context.querySelectorAll(selector));
        } catch (e) {
            return [];
        }
    };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const normalize = (str) => str ? str.trim().replace(/\s+/g, '').toLowerCase() : '';
    const formatTime = (s) => `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;

    // ====================== 日志模块 ======================
    let logList, logContent;
    function initLog() {
        logList = $('#edu-log-list');
        logContent = $('#edu-panel-content');
    }
    function log(text, type = 'info') {
        console.log(`[头歌刷课] ${text}`);
        if (!logList) return;
        try {
            const colors = { debug: '#6b7280', info: '#1f2937', success: '#059669', warn: '#d97706', error: '#dc2626' };
            const item = document.createElement('div');
            item.style.cssText = `color: ${colors[type] || colors.info}; word-break: break-all; margin: 2px 0;`;
            item.innerHTML = `[${new Date().toLocaleTimeString()}] ${text}`;
            logList.appendChild(item);
            logContent.scrollTop = logContent.scrollHeight;
        } catch (e) {
            console.error('[头歌刷课] 日志输出失败', e);
        }
    }

    // ====================== 悬浮窗模块（新增提示栏） ======================
    async function waitForBody() {
        while (!document.body) {
            await sleep(100);
        }
        return document.body;
    }

    async function initPanel() {
        if (state.panelInited && $('#edu-auto-panel')) return;
        try {
            const body = await waitForBody();
            // 移除旧悬浮窗
            const oldPanel = $('#edu-auto-panel');
            if (oldPanel) oldPanel.remove();

            // 悬浮窗HTML（新增提示栏）
            const panel = document.createElement('div');
            panel.id = 'edu-auto-panel';
            panel.innerHTML = `
            <div id="edu-panel-main" style="position: fixed; top: 100px; right: 10px; width: 360px; background: #fff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 99999999; font-size: 13px; font-family: system-ui, sans-serif; overflow: hidden;">
                <div id="edu-panel-header" style="background: #1677ff; color: #fff; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none;">
                    <span>头歌自动刷课-By:ZiMu</span>
                    <button id="edu-panel-min" style="background: none; border: none; color: #fff; cursor: pointer; font-size: 16px;">—</button>
                </div>
                <!-- 序号设置区 -->
                <div id="edu-panel-setting" style="padding: 8px 12px; background: #f0f5ff; border-bottom: 1px solid #d6e4ff; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span>当前课程序号：</span>
                    <input id="edu-input-index" type="number" min="1" value="${state.currentIndex}" style="width: 60px; padding: 4px; border: 1px solid #1677ff; border-radius: 4px; text-align: center;">
                    <button id="edu-btn-set" style="background: #1677ff; color: #fff; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer;">确认</button>
                </div>
                <!-- 倍速选择区 -->
                <div id="edu-panel-speed" style="padding: 8px 12px; background: #f8f9fa; border-bottom: 1px solid #e8e8e8; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span>视频播放倍速：</span>
                    <select id="edu-select-speed" style="padding: 4px 8px; border: 1px solid #1677ff; border-radius: 4px; background: #fff; cursor: pointer;">
                        <option value="0.5">0.5倍</option>
                        <option value="1">1倍</option>
                        <option value="1.5">1.5倍</option>
                        <option value="2" selected>2倍</option>
                        <option value="3">3倍</option>
                        <option value="4">4倍</option>
                        <option value="5">5倍</option>
                        <option value="6">6倍</option>
                        <option value="8">8倍</option>
                        <option value="10">10倍</option>
                    </select>
                    <span style="color: #666; font-size: 12px;">最高10倍速</span>
                </div>
                <!-- 【新增】温馨提示栏 -->
                <div id="edu-panel-tips" style="padding: 6px 8px; margin: 8px 12px; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 4px; font-size: 12px; color: #d46b08; line-height: 1.5;">
                    1. 倍速过高可能会导致视频卡顿、进度异常<br>
                    2. 请保证视频页面没有被最小化、离开或遮挡
                </div>
                <!-- 操作按钮区 -->
                <div id="edu-panel-buttons" style="padding: 8px 12px; background: #f5f5f5; display: flex; gap: 8px; border-bottom: 1px solid #e8e8e8;">
                    <button id="edu-btn-jump" style="background: #1677ff; color: #fff; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; flex: 1;">跳转下一课</button>
                    <button id="edu-btn-reset" style="background: #faad14; color: #fff; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; flex: 1;">重置状态</button>
                </div>
                <div id="edu-panel-content" style="max-height: 400px; overflow-y: auto; padding: 10px;">
                    <div id="edu-log-list" style="display: flex; flex-direction: column; gap: 2px;"></div>
                </div>
            </div>
            `;
            body.appendChild(panel.firstElementChild);
            initLog();
            bindPanelEvents();
            state.panelInited = true;
            log('✅ 悬浮窗创建成功，脚本已启动', 'success');
            log(`📌 当前默认播放倍速：${state.playbackRate}倍`, 'info');
        } catch (e) {
            console.error('[头歌刷课] 悬浮窗创建失败', e);
        }
    }

    // 悬浮窗事件绑定（适配提示栏最小化隐藏）
    function bindPanelEvents() {
        try {
            const panel = $('#edu-panel-main');
            const header = $('#edu-panel-header');
            const minBtn = $('#edu-panel-min');
            const indexInput = $('#edu-input-index');
            const setBtn = $('#edu-btn-set');
            const speedSelect = $('#edu-select-speed');
            const jumpBtn = $('#edu-btn-jump');
            const resetBtn = $('#edu-btn-reset');
            const settingArea = $('#edu-panel-setting');
            const speedArea = $('#edu-panel-speed');
            const tipsArea = $('#edu-panel-tips');
            const buttonArea = $('#edu-panel-buttons');

            if (!panel || !header) {
                console.error('[头歌刷课] 悬浮窗元素未找到');
                return;
            }

            // ====================== 拖动逻辑 ======================
            let isDragging = false, offsetX = 0, offsetY = 0;
            header.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isDragging = true;
                const rect = panel.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                panel.style.userSelect = 'none';
            });
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const newLeft = e.clientX - offsetX;
                const newTop = e.clientY - offsetY;
                const maxLeft = window.innerWidth - panel.offsetWidth;
                const maxTop = window.innerHeight - panel.offsetHeight;
                panel.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
                panel.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
                panel.style.right = 'auto';
            });
            document.addEventListener('mouseup', (e) => {
                if (isDragging) {
                    isDragging = false;
                    panel.style.userSelect = '';
                }
            });

            // ====================== 最小化逻辑（新增提示栏隐藏） ======================
            let isMin = false;
            minBtn.addEventListener('click', () => {
                isMin = !isMin;
                // 最小化时隐藏所有内容区
                const hideElements = [logContent, settingArea, speedArea, tipsArea, buttonArea];
                hideElements.forEach(ele => {
                    if (ele) ele.style.display = isMin ? 'none' : 'block';
                });
                minBtn.innerText = isMin ? '□' : '—';
            });

            // ====================== 倍速切换逻辑 ======================
            speedSelect.value = state.playbackRate; // 初始化选中默认值
            speedSelect.addEventListener('change', () => {
                const newSpeed = parseFloat(speedSelect.value);
                // 限制最大10倍速，最小0.1倍速
                if (newSpeed < 0.1 || newSpeed > 10) {
                    log('❌ 倍速范围：0.1~10倍', 'error');
                    speedSelect.value = state.playbackRate;
                    return;
                }
                // 更新全局倍速状态
                state.playbackRate = newSpeed;
                log(`✅ 已设置播放倍速为：${newSpeed}倍`, 'success');
                // 立即更新当前视频的倍速
                const currentVideo = $('video');
                if (currentVideo) {
                    currentVideo.playbackRate = newSpeed;
                    currentVideo.defaultPlaybackRate = newSpeed;
                    log('▶️ 当前视频倍速已实时更新', 'success');
                }
            });

            // ====================== 序号设置按钮 ======================
            setBtn.addEventListener('click', () => {
                const val = parseInt(indexInput?.value);
                if (val && val >= 1) {
                    state.currentIndex = val;
                    log(`✅ 已手动设置当前为第${val}节`, 'success');
                } else {
                    log('❌ 请输入有效的序号（≥1）', 'error');
                }
            });

            // ====================== 跳转按钮 ======================
            jumpBtn.addEventListener('click', () => {
                if (state.isJumping) return log('⚠️ 正在跳转中，请稍候', 'warn');
                log('🔘 手动点击跳转下一课', 'info');
                jumpToNext();
            });

            // ====================== 重置按钮 ======================
            resetBtn.addEventListener('click', () => {
                state.hasPlaySuccess = false;
                state.playRetryCount = 0;
                state.videoInitLock = false;
                state.isJumping = false;
                log('✅ 已重置播放状态', 'success');
            });

        } catch (e) {
            console.error('[头歌刷课] 悬浮窗事件绑定失败', e);
        }
    }

    // ====================== 课程扫描与序号识别 ======================
    function getCourseList() {
        try {
            const nodes = $$('.ant-tree-treenode-leaf');
            if (nodes.length === 0) {
                log('❌ 未找到课程节点，请展开所有折叠的章节', 'error');
                return [];
            }
            log(`✅ 扫描到${nodes.length}节课程`, 'success');
            return nodes;
        } catch (e) {
            log(`❌ 扫描课程失败: ${e.message}`, 'error');
            return [];
        }
    }

    // 最高优先级：页面标题精准匹配
    async function autoDetectCurrentIndex(courseList) {
        try {
            log('🔍 开始自动识别当前课程序号...', 'info');

            // 1. 最高优先级：页面title___bLyk5标题精准匹配
            log('🔹 【最高优先级】匹配页面标题元素 div.title___bLyk5', 'debug');
            const pageTitleEle = $('div.title___bLyk5');
            const pageTitle = normalize(pageTitleEle?.innerText);
            if (pageTitle) {
                log(`📄 页面标题：${pageTitle}`, 'debug');
                const titleMatchIndex = courseList.findIndex(node => {
                    const nodeTitle = normalize(getNodeTitle(node));
                    return nodeTitle === pageTitle;
                });
                if (titleMatchIndex !== -1) {
                    const title = getNodeTitle(courseList[titleMatchIndex]);
                    state.currentIndex = titleMatchIndex + 1;
                    const input = $('#edu-input-index');
                    if (input) input.value = state.currentIndex;
                    log(`🎯 【精准匹配成功】当前是第${state.currentIndex}节 | ${title}`, 'success');
                    return titleMatchIndex;
                }
            }
            log('⚠️ 页面标题精准匹配失败', 'warn');

            // 2. 第二优先级：AntD官方选中属性
            log('🔹 第二步：匹配官方选中属性 aria-selected', 'debug');
            const selectedNode = courseList.find(node => node.getAttribute('aria-selected') === 'true');
            if (selectedNode) {
                const index = courseList.findIndex(node => node === selectedNode);
                const title = getNodeTitle(selectedNode);
                state.currentIndex = index + 1;
                const input = $('#edu-input-index');
                if (input) input.value = state.currentIndex;
                log(`🎯 识别成功！当前是第${state.currentIndex}节 | ${title}`, 'success');
                return index;
            }
            log('⚠️ 未找到aria-selected选中节点', 'warn');

            // 3. 第三优先级：选中类匹配
            log('🔹 第三步：匹配选中类', 'debug');
            const classSelectedNode = courseList.find(node => 
                node.classList.contains('ant-tree-treenode-selected') || 
                node.classList.contains('ant-tree-node-selected') ||
                node.classList.contains('ant-tree-treenode-active')
            );
            if (classSelectedNode) {
                const index = courseList.findIndex(node => node === classSelectedNode);
                const title = getNodeTitle(classSelectedNode);
                state.currentIndex = index + 1;
                const input = $('#edu-input-index');
                if (input) input.value = state.currentIndex;
                log(`🎯 识别成功！当前是第${state.currentIndex}节 | ${title}`, 'success');
                return index;
            }
            log('⚠️ 未找到选中类节点', 'warn');

            // 4. 第四优先级：页面标题模糊匹配
            log('🔹 第四步：页面标题模糊匹配', 'debug');
            if (pageTitle) {
                const fuzzyMatchIndex = courseList.findIndex(node => {
                    const nodeTitle = normalize(getNodeTitle(node));
                    return nodeTitle && (pageTitle.includes(nodeTitle) || nodeTitle.includes(pageTitle));
                });
                if (fuzzyMatchIndex !== -1) {
                    const title = getNodeTitle(courseList[fuzzyMatchIndex]);
                    state.currentIndex = fuzzyMatchIndex + 1;
                    const input = $('#edu-input-index');
                    if (input) input.value = state.currentIndex;
                    log(`🎯 识别成功！当前是第${state.currentIndex}节 | ${title}`, 'success');
                    return fuzzyMatchIndex;
                }
            }
            log('⚠️ 页面标题模糊匹配失败', 'warn');

            // 兜底：使用手动设置的序号
            log(`🔹 使用手动设置的序号：第${state.currentIndex}节`, 'info');
            return state.currentIndex - 1;
        } catch (e) {
            log(`❌ 序号识别失败: ${e.message}`, 'error');
            return -1;
        }
    }

    function getNodeTitle(node) {
        try {
            return $('.s3___CFhfR', node)?.innerText.trim() 
                || $('div[title]', node)?.getAttribute('title') 
                || $('span[title]', node)?.getAttribute('title')
                || '未知课程';
        } catch (e) {
            return '未知课程';
        }
    }

    // ====================== 跳转逻辑 ======================
    async function jumpToNext() {
        if (state.isJumping) return;
        state.isJumping = true;
        log('==================== 开始跳转下一课 ====================', 'debug');

        try {
            const courseList = getCourseList();
            if (courseList.length === 0) throw new Error('课程列表为空');

            // 跳转前强制重新识别序号
            const currentIndex = await autoDetectCurrentIndex(courseList);
            if (currentIndex === -1) throw new Error('无法定位当前课程，请手动设置序号');

            // 判断是否是最后一课
            if (currentIndex >= courseList.length - 1) {
                log('🏁 恭喜！全部课程已播放完毕', 'success');
                alert('恭喜！所有课程视频已播放完毕');
                return;
            }

            // 找到下一课
            const nextIndex = currentIndex + 1;
            const nextNode = courseList[nextIndex];
            const nextTitle = getNodeTitle(nextNode);
            log(`✅ 当前课程：第${currentIndex+1}节`, 'success');
            log(`✅ 下一课：第${nextIndex+1}节 | ${nextTitle}`, 'success');

            // 自动展开父章节
            await expandParentChapter(nextNode);

            // 找到点击目标
            const clickTarget = $('.s3___CFhfR, .ant-tree-title div[title], .ant-tree-title span[title]', nextNode);
            if (!clickTarget) throw new Error('未找到下一课的标题点击元素');
            log('✅ 找到标题点击目标', 'debug');

            // 记录跳转前状态
            const oldVideoSrc = $('video')?.src || '';
            const oldPageTitle = normalize($('div.title___bLyk5')?.innerText);

            // 模拟用户点击
            clickTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
            await sleep(300);
            clickTarget.click();
            log('✅ 已点击下一课标题', 'success');

            // 校验跳转结果
            await checkJumpResult(nextNode, oldVideoSrc, oldPageTitle, nextIndex + 1);

        } catch (err) {
            log(`❌ 跳转失败：${err.message}`, 'error');
        } finally {
            state.isJumping = false;
            log('==================== 跳转执行结束 ====================', 'debug');
        }
    }

    // 自动展开折叠的父章节
    async function expandParentChapter(node) {
        try {
            let currentNode = node;
            while (currentNode) {
                const parentTreeItem = currentNode.parentElement.closest('.ant-tree-treenode');
                if (!parentTreeItem) break;
                const switcher = $('.ant-tree-switcher', parentTreeItem);
                if (switcher && switcher.classList.contains('ant-tree-switcher_close')) {
                    log('⚠️ 父章节处于折叠状态，正在自动展开', 'warn');
                    switcher.click();
                    await sleep(300);
                }
                currentNode = parentTreeItem;
            }
            log('✅ 所有父章节已展开，目标课程可见', 'success');
        } catch (e) {
            log(`⚠️ 展开章节失败: ${e.message}`, 'warn');
        }
    }

    // 校验跳转结果
    async function checkJumpResult(nextNode, oldVideoSrc, oldTitle, newIndex) {
        log('⏳ 等待页面响应，校验跳转结果...', 'debug');
        let jumpSuccess = false;
        let checkCount = 0;
        const maxCheckCount = 25;

        return new Promise((resolve) => {
            const checkTimer = setInterval(() => {
                checkCount++;
                try {
                    const isNodeSelected = nextNode.getAttribute('aria-selected') === 'true' 
                        || nextNode.classList.contains('ant-tree-treenode-selected');
                    const newVideoSrc = $('video')?.src || '';
                    const isVideoChanged = newVideoSrc && newVideoSrc !== oldVideoSrc;
                    const newPageTitle = normalize($('div.title___bLyk5')?.innerText);
                    const isTitleChanged = newPageTitle && newPageTitle !== oldTitle;

                    log(`🔍 第${checkCount}次校验：节点选中=${isNodeSelected} | 视频变化=${isVideoChanged} | 标题变化=${isTitleChanged}`, 'debug');

                    if (isNodeSelected || isVideoChanged || isTitleChanged) {
                        clearInterval(checkTimer);
                        jumpSuccess = true;
                        state.currentIndex = newIndex;
                        const input = $('#edu-input-index');
                        if (input) input.value = state.currentIndex;
                        log(`🎉 跳转成功！新页面标题：${newPageTitle}`, 'success');
                        resolve(true);
                        return;
                    }

                    if (checkCount >= maxCheckCount) {
                        clearInterval(checkTimer);
                        log('⚠️ 首次点击未跳转，执行重试点击', 'warn');
                        const clickTarget = $('.s3___CFhfR, .ant-tree-title div[title]', nextNode);
                        if (clickTarget) clickTarget.click();
                        setTimeout(() => {
                            try {
                                const retrySelected = nextNode.getAttribute('aria-selected') === 'true' || nextNode.classList.contains('ant-tree-treenode-selected');
                                const retryVideoSrc = $('video')?.src || '';
                                const retryTitle = normalize($('div.title___bLyk5')?.innerText);
                                const retrySuccess = retrySelected || retryVideoSrc !== oldVideoSrc || retryTitle !== oldTitle;
                                if (retrySuccess) {
                                    state.currentIndex = newIndex;
                                    const input = $('#edu-input-index');
                                    if (input) input.value = state.currentIndex;
                                    log('🎉 重试点击后跳转成功！', 'success');
                                } else {
                                    log('❌ 重试后仍未跳转，请手动检查课程是否可点击', 'error');
                                }
                                resolve(retrySuccess);
                            } catch (e) {
                                log(`❌ 重试校验失败: ${e.message}`, 'error');
                                resolve(false);
                            }
                        }, 2000);
                    }
                } catch (e) {
                    log(`❌ 跳转校验失败: ${e.message}`, 'error');
                }
            }, 200);
        });
    }

    // ====================== 视频播放控制（适配自定义倍速） ======================
    async function tryPlayVideo(videoEle) {
        if (state.hasPlaySuccess) return true;
        if (state.playRetryCount >= 20) {
            log('❌ 播放重试次数达上限，需手动点击播放', 'error');
            return false;
        }

        try {
            const hasValidSrc = videoEle.src && videoEle.src.length > 0 && !videoEle.src.includes('about:blank');
            const hasSource = videoEle.querySelector('source')?.src;
            const isReady = videoEle.readyState >= 2;

            if (!(hasValidSrc || hasSource) || !isReady) {
                state.playRetryCount++;
                log(`⏳ 第${state.playRetryCount}次检测：视频源加载中`, 'warn');
                return false;
            }

            state.playRetryCount++;
            log(`🔄 第${state.playRetryCount}次尝试自动播放`, 'info');

            // 先静音，规避浏览器播放拦截
            videoEle.muted = true;
            videoEle.volume = 0;
            // 应用用户设置的倍速
            videoEle.playbackRate = state.playbackRate;
            videoEle.defaultPlaybackRate = state.playbackRate;

            // 执行播放
            const playResult = videoEle.play();
            if (playResult !== undefined) {
                await playResult;
                state.hasPlaySuccess = true;
                log('▶️ 视频自动播放成功！', 'success');
                log('🔇 已设置视频静音', 'success');
                log(`⚡ 已设置视频${state.playbackRate}倍速`, 'success');
                return true;
            }
        } catch (err) {
            log(`⚠️ 播放失败：${err.message}`, 'warn');
            // 兜底点击播放按钮
            const playBtns = ['.vjs-big-play-button', '.vjs-play-control', 'button[aria-label="播放"]', '.play-btn'];
            for (const selector of playBtns) {
                const btn = $(selector);
                if (btn) {
                    btn.click();
                    // 点击后再次应用倍速
                    const video = $('video');
                    if (video) {
                        video.playbackRate = state.playbackRate;
                        video.defaultPlaybackRate = state.playbackRate;
                    }
                    state.hasPlaySuccess = true;
                    log('▶️ 点击播放按钮成功', 'success');
                    log(`⚡ 已设置视频${state.playbackRate}倍速`, 'success');
                    return true;
                }
            }
        }
        return false;
    }

    function initVideoControl(videoEle) {
        if (state.videoInitLock || !videoEle) return;
        state.videoInitLock = true;
        state.hasPlaySuccess = false;
        state.playRetryCount = 0;

        log('🎬 检测到视频元素，等待加载...', 'info');

        // 视频加载完成后播放
        videoEle.addEventListener('loadedmetadata', async () => {
            log('✅ 视频元数据加载完成', 'success');
            // 视频加载完成后重新识别序号
            const courseList = getCourseList();
            if (courseList.length > 0) await autoDetectCurrentIndex(courseList);
            await tryPlayVideo(videoEle);
        });

        // 立即尝试播放
        if (videoEle.readyState >= 2) {
            const courseList = getCourseList();
            if (courseList.length > 0) autoDetectCurrentIndex(courseList);
            tryPlayVideo(videoEle);
        }

        // 循环重试播放
        const retryTimer = setInterval(async () => {
            if (state.hasPlaySuccess || state.playRetryCount >= 20) {
                clearInterval(retryTimer);
                return;
            }
            if (!document.hidden) await tryPlayVideo(videoEle);
        }, 1500);

        // 防暂停守护
        let resumeLock = false;
        videoEle.addEventListener('pause', async () => {
            if (videoEle.ended || resumeLock || !state.hasPlaySuccess) return;
            resumeLock = true;
            log('⚠️ 视频被暂停，自动恢复播放', 'warn');
            await videoEle.play().catch(() => {});
            setTimeout(() => resumeLock = false, 1000);
        });

        // 【倍速守护】防止页面重置倍速
        const guardTimer = setInterval(() => {
            if (videoEle.ended) {
                clearInterval(guardTimer);
                return;
            }
            // 强制保持用户设置的倍速
            if (videoEle.playbackRate !== state.playbackRate) {
                videoEle.playbackRate = state.playbackRate;
                videoEle.defaultPlaybackRate = state.playbackRate;
                log(`🔄 已恢复${state.playbackRate}倍速`, 'debug');
            }
            // 强制保持静音
            if (!videoEle.muted) {
                videoEle.muted = true;
                videoEle.volume = 0;
            }
        }, 3000);

        // 进度监听
        const progressTimer = setInterval(() => {
            if (videoEle.ended) {
                clearInterval(progressTimer);
                return;
            }
            const current = Math.floor(videoEle.currentTime);
            const total = Math.floor(videoEle.duration);
            if (isNaN(total)) return;
            const percent = ((current / total) * 100).toFixed(1);
            if (current % 60 === 0 && current > 0) {
                log(`📊 播放进度：${formatTime(current)}/${formatTime(total)} (${percent}%)`, 'info');
            }
        }, 1000);

        // 播放结束自动跳转
        videoEle.addEventListener('ended', async () => {
            clearInterval(guardTimer);
            clearInterval(progressTimer);
            clearInterval(retryTimer);
            log('🎉 当前视频播放完毕，准备跳转下一课', 'success');
            await jumpToNext();
        });

        // 页面可见性监听
        document.addEventListener('visibilitychange', async () => {
            if (!document.hidden) {
                if (!state.hasPlaySuccess && videoEle.readyState >= 2) {
                    await tryPlayVideo(videoEle);
                }
                if (state.hasPlaySuccess && !videoEle.ended && videoEle.paused) {
                    await videoEle.play().catch(() => {});
                    log('🔄 页面切回，恢复播放', 'info');
                }
            }
        });
    }

    // ====================== 全局监听 ======================
    function initGlobalObserver() {
        try {
            const observer = new MutationObserver(() => {
                const videoEle = $('video');
                if (videoEle) {
                    if (!state.videoInitLock || videoEle.src !== state.lastVideoSrc) {
                        state.lastVideoSrc = videoEle.src;
                        state.hasPlaySuccess = false;
                        state.playRetryCount = 0;
                        state.videoInitLock = false;
                        state.isJumping = false;
                        log('🔄 检测到课程切换，已重置状态', 'info');
                        initVideoControl(videoEle);
                    }
                }
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src', 'class', 'aria-selected']
            });

            // 用户点击页面时重新识别序号
            document.addEventListener('click', async () => {
                await sleep(500);
                const courseList = getCourseList();
                if (courseList.length > 0) await autoDetectCurrentIndex(courseList);
            }, { passive: true });
        } catch (e) {
            console.error('[头歌刷课] 全局监听初始化失败', e);
        }
    }

    // ====================== 多重初始化兜底 ======================
    async function initScript() {
        if (state.panelInited) return;
        await initPanel();
        initGlobalObserver();
        const videoEle = $('video');
        if (videoEle) {
            state.lastVideoSrc = videoEle.src;
            initVideoControl(videoEle);
        }
        // 页面加载完成后扫描课程
        setTimeout(async () => {
            const courseList = getCourseList();
            if (courseList.length > 0) await autoDetectCurrentIndex(courseList);
        }, 2000);
    }

    // 多重触发时机，确保脚本一定执行
    document.addEventListener('DOMContentLoaded', initScript);
    window.addEventListener('load', initScript);
    setTimeout(initScript, 3000);
    initScript();

})();