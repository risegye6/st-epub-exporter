import { chat, characters, this_chid, name1 } from '../../../../script.js';

jQuery(async () => {
    try {
        // ------------------------------------------------------
        // 1. 마법봉(Extensions) 메뉴
        // ------------------------------------------------------
        function addEpubMenuButton(retryCount = 0) {
            const MAX_RETRIES = 10;
            if (document.getElementById("epub-export-menu-item")) return;
            
            const extensionsMenu = document.getElementById("extensionsMenu");
            if (!extensionsMenu) {
                if (retryCount < MAX_RETRIES) {
                    setTimeout(() => addEpubMenuButton(retryCount + 1), 1000);
                }
                return;
            }
            
            const menuItem = document.createElement("div");
            menuItem.id = "epub-export-menu-item";
            menuItem.className = "list-group-item flex-container flexGap5 interactable";
            menuItem.tabIndex = 0;
            menuItem.role = "listitem";
            menuItem.innerHTML = `
                <div class="fa-solid fa-book extensionsMenuExtensionButton"></div>
                EPUB 내보내기
            `;
            
            menuItem.addEventListener("click", function() {
                openEpubExportModal();
                $("#extensionsMenu").hide();
            });
            
            extensionsMenu.appendChild(menuItem);
        }

        // ------------------------------------------------------
        // 2. 모달 팝업 및 HTML 렌더링
        // ------------------------------------------------------
        function openEpubExportModal() {
            const existingModal = document.getElementById("epub-export-modal");
            if (existingModal) existingModal.remove();

            let characterNameDefault = characters[this_chid]?.name || "Character";

            const modalHtml = `
            <div id="epub-export-modal" class="epub-modal-overlay">
                <div class="epub-modal-content">
                    <div id="epub_btn_close" class="epub-close-btn">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                    
                    <h3>EPUB 내보내기 설정</h3>
                    
                    <div class="epub-setting-group">
                        <label><strong>1. 챕터 지정 (선택) </strong></label>
                        <small style="opacity: 0.7; margin-bottom: 2px;">형식: 챕터명 : 시작번호 - 끝번호 (비워두면 전체 저장)</small>
                        <textarea id="epub-chapters" class="epub-textarea" placeholder="프롤로그 : 0-50\n1장 : 51-120"></textarea>
                    </div>

                    <div class="epub-setting-group">
                        <label><strong>2. 에셋 이미지 경로 지정</strong></label>
                        <input type="text" id="epub-chat-image-path" class="epub-text-input" value="/characters/${characterNameDefault}/">
                    </div>

                    <div class="epub-setting-group">
                        <label><strong>3. 마크다운 디자인 </strong></label>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            <span>기울임꼴 색상:</span>
                            <input type="text" id="epub-italic-color" class="epub-text-input" value="#4A4D39" style="width:100px; text-align:center;">
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span>굵은글씨 색상:</span>
                            <input type="text" id="epub-bold-color" class="epub-text-input" value="#292421" style="width:100px; text-align:center;">
                        </div>
                    </div>

                    <div class="epub-setting-group" style="margin-top:15px;">
                        <label><strong>4. 아바타 프사 포함</strong>
                        <input 
                            type="checkbox" 
                            id="epub-include-avatars" 
                            checked 
                        >
                        </label>
                    </div>
                    
                    <div class="epub-modal-actions">
                        <button id="epub-close-modal" class="menu_button">취소</button>
                        <button id="epub-run-export" class="menu_button interactable">다운로드</button>
                    </div>
                </div>
            </div>
            `;
            
            const safeZone = document.getElementById('popup_container') || document.body;
            safeZone.insertAdjacentHTML('beforeend', modalHtml);

            function closeEpubModal() {
                const modal = document.getElementById("epub-export-modal");
                if (modal) modal.remove();
            }

            document.getElementById("epub_btn_close").addEventListener("click", closeEpubModal);
            document.getElementById("epub-close-modal").addEventListener("click", closeEpubModal);

            // ------------------------------------------------------
            // 3. 다운로드 버튼 클릭 시 구동하는 백엔드 코어
            // ------------------------------------------------------
            $('#epub-run-export').off('click').on('click', async () => {
                if (!chat || chat.length === 0) {
                    toastr.warning("가져올 채팅 기록이 없습니다.");
                    return;
                }

                $('#epub-run-export').text("변환 중...").prop('disabled', true);

                if (typeof JSZip === 'undefined') await $.getScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
                if (typeof marked === 'undefined') await $.getScript("https://cdn.jsdelivr.net/npm/marked/marked.min.js");

                let characterName = characters[this_chid]?.name || "Story";
                let userName = name1 || "User";
                
                let chapterInput = $('#epub-chapters').val().trim();
                let chatImagePath = $('#epub-chat-image-path').val().trim();
                if (!chatImagePath.endsWith('/')) chatImagePath += '/';
                
                let italicColor = $('#epub-italic-color').val();
                let boldColor = $('#epub-bold-color').val();
                let includeAvatars = $('#epub-include-avatars').is(':checked');

                const chapterRegex = /(.+?)\s*:\s*(\d+)\s*(?:-|~)\s*(\d+)/;
                const chatImageRegex = /{{\s*(?:[^}]*?::\s*)?([^}]+?\.(?:png|jpg|jpeg|gif|webp))\s*}}/gi;

                let chapterConfig = [];
                if (chapterInput) {
                    chapterInput.split('\n').forEach(line => {
                        let match = line.match(chapterRegex);
                        if (match) chapterConfig.push({ title: match[1].trim(), start: parseInt(match[2]), end: parseInt(match[3]) });
                    });
                }

                let zip = new JSZip();
                let oebps = zip.folder("OEBPS");
                let imagesFolder = oebps.folder("images");

                async function fetchImageBuffer(url) {
                    try { let res = await fetch(url); return res.ok ? await res.arrayBuffer() : null; } 
                    catch (e) { return null; }
                }

                const mimeTypes = { 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp' };

                let referencedChatImages = new Set();
                chat.forEach(msg => {
                    if (msg.is_system) return;
                    let match;
                    while ((match = chatImageRegex.exec(msg.mes)) !== null) {
                        referencedChatImages.add(match[1].trim());
                    }
                });

                let manifestEntries = [];
                for (let filename of referencedChatImages) {
                    let url = encodeURI(`${chatImagePath}${filename}`);
                    let imageData = await fetchImageBuffer(url);
                    if (imageData) {
                        imagesFolder.file(filename, imageData);
                        let ext = filename.split('.').pop().toLowerCase();
                        let safeId = filename.replace(/[^a-zA-Z0-9]/g, '_');
                        manifestEntries.push(`<item id="chatImg_${safeId}" href="images/${encodeURIComponent(filename)}" media-type="${mimeTypes[ext] || 'image/png'}"/>`);
                    } else {
                        console.warn(`이미지 파일을 찾지 못했습니다: ${url}`);
                    }
                }
                // ======================================================
                // 아바타 수집
                // ======================================================
                let charAvatarExt = "", userAvatarExt = "";
                if (includeAvatars) {
                    let domCharAvatarUrl = $('.mes[is_user="false"] .avatar img').first().attr('src');
                    let domUserAvatarUrl = $('.mes[is_user="true"] .avatar img').first().attr('src');

                    if (!domUserAvatarUrl) {
                        domUserAvatarUrl = $('#user_avatar').attr('src'); 
                    }

                    // 캐릭터 프사 경로
                    let charAvatarUrl = domCharAvatarUrl || (characters[this_chid]?.avatar ? `/characters/${encodeURIComponent(characters[this_chid].avatar)}` : null);
                    
                    // 유저 프사 경로 
                    let userAvatarUrl = domUserAvatarUrl;

                    if (charAvatarUrl) {
                        let charData = await fetchImageBuffer(charAvatarUrl);
                        if (charData) {
                            charAvatarExt = "char_avatar.png";
                            imagesFolder.file(charAvatarExt, charData);
                            manifestEntries.push(`<item id="charAvatarImg" href="images/${charAvatarExt}" media-type="image/png"/>`);
                        }
                    }
                    
                    if (userAvatarUrl) {
                        let userData = await fetchImageBuffer(userAvatarUrl);
                        if (userData) {
                            userAvatarExt = "user_avatar.png";
                            imagesFolder.file(userAvatarExt, userData);
                            manifestEntries.push(`<item id="userAvatarImg" href="images/${userAvatarExt}" media-type="image/png"/>`);
                        } else {
                            console.warn(`[EPUB Export] 유저 아바타 다운로드 실패: ${userAvatarUrl}`);
                        }
                    }
                }
                // ======================================================

                if (chapterConfig.length === 0) chapterConfig.push({ title: `${characterName}`, start: 0, end: chat.length - 1 });

                let chapters = [];
                chapterConfig.forEach(conf => {
                    let content = `<h2>${conf.title}</h2>\n`;
                    let hasMessage = false;

                    for (let i = conf.start; i <= conf.end; i++) {
                        if (!chat[i] || chat[i].is_system) continue;
                        hasMessage = true;
                        let msg = chat[i];
                        let isUser = msg.is_user;
                        
                        let text = msg.mes
                            .replace(/<status>[\s\S]*?<\/status>/gi, "") 
                            .replace(/<choices>[\s\S]*?<\/choices>/gi, "")
                            .replace(/\[.*?\]/g, "") 
                            .replace(/<br\s*\/?>/gi, "\n"); 
                            
                        let formattedText = marked.parse(text, { xhtml: true })
                            .replace(/<hr>/gi, '<hr />')
                            .replace(/<br>/gi, '<br />')
                            .replace(chatImageRegex, (match, filename) => {
                                let cleanFilename = filename.trim();
                                return `<img src="images/${encodeURIComponent(cleanFilename)}" class="chat-inline-image" alt="Embedded Image" />`;
                            });

                        let avatarHtml = "";
                        if (includeAvatars) {
                            let imgSrc = isUser && userAvatarExt ? `images/${userAvatarExt}` : (!isUser && charAvatarExt ? `images/${charAvatarExt}` : "");
                            if (imgSrc) avatarHtml = `<img src="${imgSrc}" class="avatar" alt="avatar" />`;
                        }

                        content += `
                        <div class="chat-block ${isUser ? "msg-user" : "msg-char"}">
                            <div class="chat-header">${avatarHtml} <span class="chat-name">${isUser ? userName : characterName}</span></div>
                            <div class="chat-body">${formattedText}</div>
                        </div>\n`;
                    }
                    if (hasMessage) chapters.push({ title: conf.title, content: content });
                });

                if (chapters.length === 0) chapters.push({ title: "내용 없음", content: "<p>지정된 범위에 내용이 없습니다.</p>" });

                let cssContent = `
                    body { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif; line-height: 1.7; padding: 2%; background-color: #E8E2DA; color: #26211D; }
                    h2 { border-bottom: 2px solid #ccc; padding-bottom: 5px; }
                    em { color: ${italicColor}; font-style: italic; }
                    strong { color: ${boldColor}; font-weight: bold; }
                    .chat-block { margin-bottom: 20px; }
                    .chat-header { font-weight: bold; font-size: 1.1em; margin-bottom: 5px; }
                    .chat-name { margin-left: 10px; color: #4B3D33; display: inline-block; vertical-align: middle; }
                    .msg-user .chat-name { color: #8A6B57; }
                    .msg-char .chat-name { color: #6B5A4D; }
                    .avatar { width: 40px !important; height: 40px !important; min-width: 40px !important; min-height: 40px !important; max-width: 40px !important; max-height: 40px !important; border-radius: 50%; border: 1px solid rgba(0,0,0,0.08); object-fit: cover; display: inline-block; vertical-align: middle; box-sizing: border-box; }
                    .chat-body { padding: 14px 16px; background-color: #FAF3EC; border-radius: 14px; border: 1px solid rgba(218, 218, 218, 0.6); }
                    .msg-user .chat-body { background-color: #E2CEC0; }
                    p { margin: 0.5em 0; }
                    .chat-inline-image { max-width: 100%; height: auto; margin: 10px auto; border-radius: 4px; display: block; }
                    code {
                        background-color: #f0f0f0 !important;
                        color: inherit !important;
                        padding: 2px 5px !important;
                        border-radius: 4px !important;
                        font-family: inherit !important;
                        font-size: 0.9em !important;
                        word-break: break-word !important;
                        word-wrap: break-all !important;
                        overflow-wrap: break-word !important;
                        white-space: normal !important;
                    }
                    pre {
                        background-color: rgba(128, 128, 128, 0.1) !important;
                        color: inherit !important;
                        padding: 12px !important;
                        border-radius: 6px !important;
                        font-family: inherit !important;
                        font-size: 0.85em !important;
                        
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                        white-space: pre-wrap !important;
                        word-wrap: break-word !important;
                        word-break: break-all !important;
                        overflow-wrap: break-word !important;
                        
                        border: 1px solid rgba(128, 128, 128, 0.3) !important;
                        margin: 10px 0 !important;
                    }
                    pre code {
                        background-color: transparent !important;
                        color: inherit !important;
                        padding: 0 !important;
                        font-family: inherit !important;
                        white-space: inherit !important;
                        word-break: inherit !important;
                        border: none !important;
                    }
                `;
                oebps.file("style.css", cssContent);

                zip.file("mimetype", "application/epub+zip");
                zip.folder("META-INF").file("container.xml", `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);

                let manifestItems = `<item id="css" href="style.css" media-type="text/css"/>\n`;
                manifestEntries.forEach(entry => manifestItems += `${entry}\n`);
                
                let spineItems = "", navPoints = "";
                chapters.forEach((chap, index) => {
                    let chapNum = index + 1;
                    let fileName = `chapter${chapNum}.html`;
                    
                    oebps.file(fileName, `<?xml version="1.0" encoding="UTF-8"?>
                    <!DOCTYPE html>
                    <html xmlns="http://www.w3.org/1999/xhtml">
                    <head><title>${chap.title}</title><link rel="stylesheet" type="text/css" href="style.css" /></head>
                    <body>${chap.content}</body>
                    </html>`);

                    manifestItems += `<item id="chap${chapNum}" href="${fileName}" media-type="application/xhtml+xml"/>\n`;
                    spineItems += `<itemref idref="chap${chapNum}"/>\n`;
                    navPoints += `<navPoint id="navPoint-${chapNum}" playOrder="${chapNum}"><navLabel><text>${chap.title}</text></navLabel><content src="${fileName}"/></navPoint>\n`;
                });

                oebps.file("content.opf", `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${characterName}</dc:title><dc:language>ko</dc:language></metadata><manifest>${manifestItems}<item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="toc">${spineItems}</spine></package>`);
                oebps.file("toc.ncx", `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:12345"/></head><docTitle><text>${characterName}</text></docTitle><navMap>${navPoints}</navMap></ncx>`);

                zip.generateAsync({type:"blob"}).then(function(content) {
                    let link = document.createElement('a');
                    link.href = URL.createObjectURL(content);
                    link.download = `${characterName}_Log.epub`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    setTimeout(() => { URL.revokeObjectURL(link.href); }, 5000);

                    toastr.success('성공! EPUB 파일이 다운로드되었습니다.');
                    
                    $('#epub-run-export').text("다운로드").prop('disabled', false);
                });
            });
        }

        addEpubMenuButton();
    } catch (err) {
        console.error("EPUB Exporter 에러:", err);
    }
});