export function getTimezoneOffset (_timeZone: string): number | null{
  // Process old-style timezones
  const timeZone = {
    'America - Pacific': 'America/Los_Angeles',
    'America - Arizona': 'America/Phoenix',
    'America - Mountain': 'America/Denver',
    'America - Central': 'America/Chicago',
    'America - Eastern': 'America/New_York',
  }[_timeZone] || _timeZone;
  
  let timeZoneObj = null;
  try {
    timeZoneObj = Intl.DateTimeFormat("ia", {
      timeZoneName: "short",
      timeZone,
    });
  } catch (ex) {}

  if (!timeZoneObj) return null;

  const timeZoneName = timeZoneObj
    .formatToParts()
    .find((i) => i.type === "timeZoneName")?.value;

  if (!timeZoneName) return null;

  const offset = timeZoneName.slice(3);
  if (!offset) return 0;

  const matchData = offset.match(/([+-])(\d+)(?::(\d+))?/);
  if (!matchData) throw new Error(`Cannot parse timezone name: ${timeZoneName}`);

  const [, sign, hour, minute] = matchData;
  let result = parseInt(hour) * 60;
  if (sign === "+") result *= -1;
  if (minute) result += parseInt(minute);

  return result / 60;
};