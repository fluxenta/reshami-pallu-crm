import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // Delhivery rules:
    // - Same-day pickup is available only if the request is made before 2:00 PM (14:00).
    // - Morning slot (10:00:00) is available only if requested before 9:30 AM on the same day.
    // - Afternoon slot (14:00:00) is available on the same day if before 1:30 PM.
    // - For future days, both morning and afternoon slots are available.
    
    const now = new Date();
    // Convert to Indian Standard Time (IST, UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    
    const currentHour = istTime.getUTCHours();
    const currentMinute = istTime.getUTCMinutes();
    const currentTimeFraction = currentHour + currentMinute / 60;

    const dates = [];
    
    const formatDate = (d: Date) => d.toISOString().split("T")[0];
    const getDayName = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "long" });

    // Generate date and slot options for today and the next 3 days
    for (let i = 0; i < 4; i++) {
      const targetDate = new Date(istTime.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = formatDate(targetDate);
      const isToday = i === 0;

      const slots = [];
      
      if (isToday) {
        if (currentTimeFraction < 14.0) {
          if (currentTimeFraction < 9.5) {
            slots.push({ value: "10:00:00", label: "Morning (10:00 AM - 01:00 PM)" });
          }
          if (currentTimeFraction < 13.5) {
            slots.push({ value: "14:00:00", label: "Afternoon (02:00 PM - 05:00 PM)" });
          }
        }
      } else {
        slots.push({ value: "10:00:00", label: "Morning (10:00 AM - 01:00 PM)" });
        slots.push({ value: "14:00:00", label: "Afternoon (02:00 PM - 05:00 PM)" });
      }

      if (slots.length > 0) {
        dates.push({
          date: dateStr,
          day: getDayName(targetDate),
          label: isToday ? `Today (${dateStr})` : `${getDayName(targetDate)} (${dateStr})`,
          slots
        });
      }
    }

    // Limit to the next 3 available days
    const availableDays = dates.slice(0, 3);

    return NextResponse.json({
      success: true,
      provider: "Delhivery",
      availableDays
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch slots from Delhivery rules." },
      { status: 500 }
    );
  }
}
