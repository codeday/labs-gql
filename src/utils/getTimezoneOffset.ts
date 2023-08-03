export function getTimezoneOffset (timeZone: string): number | null{
  const timeZoneObj = Intl.DateTimeFormat("ia", {
    timeZoneName: "short",
    timeZone,
  });
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