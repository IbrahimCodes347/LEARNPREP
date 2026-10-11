import { GRADE_OPTIONS, PASS_PERCENTAGE, UNASSIGNED_GRADE } from '../utils/constants.js';
import { ok } from '../utils/response.js';

/**
 * Public app metadata so the register form and admin grade inputs render the
 * exact list of allowed classes and never hardcode the pass mark.
 */
export function getConfig(req, res) {
  return ok(
    res,
    { gradeOptions: GRADE_OPTIONS, passPercentage: PASS_PERCENTAGE, unassignedGrade: UNASSIGNED_GRADE },
    'Config loaded'
  );
}

export default { getConfig };