(function (root) {
    const infoKeys = ['flipCardInfo', 'filpCardInfo', 'flipCardAudioInfo', 'filpCardAudioInfo', 'flipCardVideoInfo', 'filpCardVideoInfo'];

    function parseArchiveMessageJson(text) {
        return JSON.parse(String(text).replace(/("(?:questionId|answerId|giftId)"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"'));
    }

    function objectValue(value) {
        if (typeof value === 'string') {
            try { return parseArchiveMessageJson(value); } catch (_) { return {}; }
        }
        return value && typeof value === 'object' ? value : {};
    }

    function validId(value) {
        if (typeof value === 'number' && !Number.isSafeInteger(value)) return '';
        const id = String(value ?? '');
        return /^[1-9]\d{0,31}$/.test(id) ? id : '';
    }

    function getArchiveFlipIds(record) {
        const content = objectValue(record?.content || record?.bodys || record?.body);
        const body = objectValue(content.bodys || content.body);
        for (const source of [content, body, record || {}]) {
            for (const key of infoKeys) {
                const info = objectValue(source[key]);
                if (info.questionId != null) return { flipQuestionId: validId(info.questionId), flipAnswerId: validId(info.answerId) };
            }
            if (source.questionId != null) return { flipQuestionId: validId(source.questionId), flipAnswerId: validId(source.answerId) };
        }
        return { flipQuestionId: '', flipAnswerId: '' };
    }

    function createArchiveFlipUserFeature(options) {
        const usersByContainer = new WeakMap();
        const doc = root.document;
        function element(tag, className, text) {
            const node = doc.createElement(tag);
            node.className = className;
            if (text != null) node.textContent = text;
            return node;
        }

        function decorate(container, post, memberAvatar = '') {
            if (!post.isReply || container.querySelector('.room-flip-message')) return;
            const questionLabel = container.querySelector('.flip-label.question-tag');
            const answerLabel = container.querySelector('.flip-label.answer-tag');
            if (!questionLabel || !answerLabel) return;
            const questionBlock = questionLabel.closest('p, blockquote') || questionLabel.parentElement;
            const answerBlock = answerLabel.closest('p, blockquote') || answerLabel.parentElement;
            if (questionBlock === answerBlock || questionBlock.contains(answerBlock) || answerBlock.contains(questionBlock)) return;
            const memberName = post.nameStr || post.groupName || '成员';
            const message = element('div', 'room-flip-message archive-flip-message');

            function section(block, label, isAnswer) {
                const section = element('div', `room-flip-section${isAnswer ? ' room-flip-answer-section' : ''}`);
                const header = element('div', 'room-flip-section-header');
                const title = element('div', 'room-flip-section-title');
                const body = element('div', 'room-flip-section-body');
                const prefix = label.closest('strong') || label;
                prefix.remove();
                while (block.firstChild) body.appendChild(block.firstChild);
                header.appendChild(label);
                header.appendChild(title);
                section.appendChild(header);
                section.appendChild(body);
                message.appendChild(section);
                return { title, body };
            }

            const question = section(questionBlock, questionLabel, false);
            const slot = element('span', 'room-flip-question-user-slot', '用户');
            if (validId(post.flipQuestionId)) {
                slot.dataset.questionId = validId(post.flipQuestionId);
                slot.dataset.answerId = validId(post.flipAnswerId);
            } else slot.dataset.flipUserState = 'unavailable';
            question.title.append(slot, element('span', '', '向'), element('strong', '', memberName), element('span', '', '提问'));

            const answer = section(answerBlock, answerLabel, true);
            const member = element('button', 'room-flip-question-user room-flip-answer-user');
            member.type = 'button';
            member.disabled = !validId(post.userId);
            if (memberAvatar) {
                const image = element('img', 'avatar room-flip-question-user-avatar');
                image.src = memberAvatar;
                image.alt = '';
                image.addEventListener('error', () => { image.hidden = true; }, { once: true });
                member.appendChild(image);
            }
            member.appendChild(element('span', '', memberName));
            member.addEventListener('click', event => {
                event.stopPropagation();
                options.openProfile(String(post.userId), memberName, memberAvatar, true);
            });
            answer.title.append(member, element('span', '', '的回复'));
            questionBlock.replaceWith(message);
            answerBlock.remove();
            for (const media of container.querySelectorAll('.audio-wrapper, audio, video')) {
                if (!message.contains(media)) answer.body.appendChild(media);
            }
        }

        function observe(container) {
            if (!container) return;
            let users = usersByContainer.get(container);
            if (!users) {
                users = root.YayaRendererFeatures.createRoomFlipUserFeature(options);
                usersByContainer.set(container, users);
            }
            users.observe(container);
        }
        return { decorate, observe };
    }

    const api = { createArchiveFlipUserFeature, getArchiveFlipIds, parseArchiveMessageJson };
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.YayaRendererFeatures = Object.assign(root.YayaRendererFeatures || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
