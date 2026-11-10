const parseStudentIds = (value) => {
  if (typeof value !== 'string' || !/^\d+(,\d+)*$/.test(value)) return null;

  const ids = [...new Set(value.split(',').map(Number))];
  if (ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) return null;
  return ids;
};

module.exports = parseStudentIds;
