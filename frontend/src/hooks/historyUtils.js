export const toTimestamp = (value) => {
  const time = new Date(value ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const isWhitespaceOnly = (value) =>
  typeof value === 'string' && value.length > 0 && value.trim().length === 0;

export const isValidCalendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
};

export const getBirthTimestamp = (record) => {
  const year = Number(record?.birthYear);
  const month = Number(record?.birthMonth);
  const day = Number(record?.birthDay);
  const hour = Number(record?.birthHour);
  if (![year, month, day].every(Number.isFinite)) return null;
  const safeHour = Number.isFinite(hour) ? hour : 0;
  return Date.UTC(year, month - 1, day, safeHour, 0, 0);
};

export const sortRecordsForDisplay = (records, sortOption) => {
  if (!Array.isArray(records) || records.length < 2) return records;
  const list = [...records];
  const createdDesc = (a, b) => {
    const diff = toTimestamp(b?.createdAt) - toTimestamp(a?.createdAt);
    return diff !== 0 ? diff : (b?.id ?? 0) - (a?.id ?? 0);
  };
  const createdAsc = (a, b) => {
    const diff = toTimestamp(a?.createdAt) - toTimestamp(b?.createdAt);
    return diff !== 0 ? diff : (a?.id ?? 0) - (b?.id ?? 0);
  };
  const nameDesc = (a, b) => {
    const nameA = (a?.name ?? '').toLowerCase();
    const nameB = (b?.name ?? '').toLowerCase();
    const diff = nameB.localeCompare(nameA);
    return diff !== 0 ? diff : createdDesc(a, b);
  };
  const nameAsc = (a, b) => {
    const nameA = (a?.name ?? '').toLowerCase();
    const nameB = (b?.name ?? '').toLowerCase();
    const diff = nameA.localeCompare(nameB);
    return diff !== 0 ? diff : createdAsc(a, b);
  };
  const birthDesc = (a, b) => {
    const timeA = getBirthTimestamp(a);
    const timeB = getBirthTimestamp(b);
    if (timeA !== null && timeB !== null) {
      const diff = timeB - timeA;
      return diff !== 0 ? diff : createdDesc(a, b);
    }
    if (timeA === null && timeB !== null) return 1;
    if (timeA !== null && timeB === null) return -1;
    return createdDesc(a, b);
  };
  const birthAsc = (a, b) => {
    const timeA = getBirthTimestamp(a);
    const timeB = getBirthTimestamp(b);
    if (timeA !== null && timeB !== null) {
      const diff = timeA - timeB;
      return diff !== 0 ? diff : createdAsc(a, b);
    }
    if (timeA === null && timeB !== null) return 1;
    if (timeA !== null && timeB === null) return -1;
    return createdAsc(a, b);
  };

  switch (sortOption) {
    case 'created-asc':
      return list.sort(createdAsc);
    case 'name-desc':
      return list.sort(nameDesc);
    case 'name-asc':
      return list.sort(nameAsc);
    case 'birth-desc':
      return list.sort(birthDesc);
    case 'birth-asc':
      return list.sort(birthAsc);
    case 'created-desc':
    default:
      return list.sort(createdDesc);
  }
};

export const sortDeletedRecordsForDisplay = (records, primaryId) => {
  if (!Array.isArray(records) || records.length < 2) return records;
  const list = [...records];
  const primaryFirst = (a, b) => {
    if (a.id === primaryId && b.id !== primaryId) return -1;
    if (a.id !== primaryId && b.id === primaryId) return 1;
    return toTimestamp(b?.deletedAt) - toTimestamp(a?.deletedAt);
  };
  return list.sort(primaryFirst);
};
