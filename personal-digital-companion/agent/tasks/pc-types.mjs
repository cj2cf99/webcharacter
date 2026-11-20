export const pcRegistrations=Object.freeze({
  'pc.exercise.create':'hu-shi.exercise.create','pc.food.create':'hu-shi.food.create',
  'pc.event.create':'hu-shi.event.create','pc.diaries.create':'diaries.create','pc.records.create':'records.create',
  'pc.reminders.create':'reminders.create','pc.planner.hours':'planner.hours.record','pc.reminders.move':'reminders.move'
});
export const isPcRegistration=type=>Object.hasOwn(pcRegistrations,type);
export const PC_IMAGE_GENERATE='pc.image.generate';
