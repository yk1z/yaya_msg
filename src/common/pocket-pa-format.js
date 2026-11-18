function formatPocketPa(timestamp, compactUuid, hashMd5) {
    const prefix = `${timestamp}${compactUuid}`;
    const digest = hashMd5(prefix + 'ejrw9u345h32u@#&%^#G');
    return `${prefix}${digest}2021060901`;
}

module.exports = { formatPocketPa };
