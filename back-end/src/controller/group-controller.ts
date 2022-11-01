import { NextFunction, Request, Response } from "express"
import { getRepository } from "typeorm"
import { Group } from "../entity/group.entity"
import { GroupStudent } from "../entity/group-student.entity"
import { Student } from "../entity/student.entity"
import { StudentRollState } from "../entity/student-roll-state.entity"
import { Roll } from "../entity/roll.entity"
import { CreateGroupInput, UpdateGroupInput } from "../interface/group.interface"
import { CreateGroupStudentInput } from "../interface/group-student.interface"
import { map } from "lodash"

export class GroupController {
  private groupRepository = getRepository(Group)
  private groupStudentRepository = getRepository(GroupStudent)
  private studentRepository = getRepository(Student)
  private studentRollStateRepository = getRepository(StudentRollState)

  async allGroups(request: Request, response: Response, next: NextFunction) {
    // Task 1:
    // Return the list of all groups
    return this.groupRepository.find()
  }

  async createGroup(request: Request, response: Response, next: NextFunction) {
    // Task 1:
    // Add a Group
    const { body: params } = request

    const createGroupInput: CreateGroupInput = {
      name: params.name,
      number_of_weeks: params.number_of_weeks,
      roll_states: params.roll_states,
      incidents: params.incidents,
      ltmt: params.ltmt,
    }
    const group = new Group()
    group.prepareToCreate(createGroupInput)
    return this.groupRepository.save(group)
  }

  async updateGroup(request: Request, response: Response, next: NextFunction) {
    // Task 1:
    // Update a Group
    const { body: params } = request

    return this.groupRepository.findOne(params.id).then((group) => {
      const updateGroupInput: UpdateGroupInput = {
        id: params.id,
        name: params.name,
        number_of_weeks: params.number_of_weeks,
        roll_states: params.roll_states,
        incidents: params.incidents,
        ltmt: params.ltmt,
      }
      group.prepareToUpdate(updateGroupInput)
      return this.groupRepository.save(group)
    })
  }

  async removeGroup(request: Request, response: Response, next: NextFunction) {
    // Task 1:
    // Delete a Group
    let groupToRemove = await this.groupRepository.findOne(request.params.id)
    return await this.groupRepository.remove(groupToRemove)
  }

  async getGroupStudents(request: Request, response: Response, next: NextFunction) {
    // Task 1:
    // Return the list of Students that are in a Group
  }

  // get a date of sunday of the given previous week
  // as per date standard every week starts from sunday (0 to 6)
  getPreviousMonday(noOfweek: number) {
    let date = new Date()
    let day = date.getDay()
    let prevSunday = new Date()
    let interval = noOfweek * 7
    prevSunday.setDate(date.getDate() - (day + interval))
    console.log(prevSunday.toISOString().slice(0, 10))
    return prevSunday.toISOString().slice(0, 10)
  }
  async addGroupStudents(filterResult: any[], groupId: number) {
    const groupStudents: GroupStudent[] = map(filterResult, (result) => {
      const createGroupStudentInput: CreateGroupStudentInput = {
        student_id: result.student_id,
        group_id: groupId,
        incident_count: result.incident_count,
      }
      const groupStudent = new GroupStudent()
      groupStudent.prepareToCreate(createGroupStudentInput)
      return groupStudent
    })

    return await this.groupStudentRepository.save(groupStudents)
  }
  async runGroupFilters(request: Request, response: Response, next: NextFunction) {
    // Task 2:
    // 1. Clear out the groups (delete all the students from the groups)
    // 2. For each group, query the student rolls to see which students match the filter for the group
    // 3. Add the list of students that match the filter to the group

    // 1. remove all the students from the groups
    await this.groupStudentRepository.clear()

    //2. For each group, query the student rolls to see which students match the filter for the group
    let groups = await this.groupRepository.find()
    let filterResult: any[]
    let runAt = new Date()
    runAt.toISOString().split("T")[0]
    groups.forEach(async (group) => {
      filterResult = await this.studentRollStateRepository
        .createQueryBuilder("student") // first argument is an alias. Alias is what you are selecting - photos. You must specify it.
        .innerJoin(StudentRollState, "studentRollState", "studentRollState.student_id = student.id")
        .innerJoin(Roll, "roll", "studentRollState.roll_id = roll.id")
        .select("COUNT(studentRollState.student_id)", "incident_count")
        .addSelect("studentRollState.student_id", "student_id")
        .addSelect("studentRollState.roll_id", "roll_id")
        .where("studentRollState.state= :state", { state: group.roll_states })
        .andWhere("roll.completed_at >= :attendance", { attendance: this.getPreviousMonday(group.number_of_weeks) })
        .groupBy("studentRollState.student_id")
        .having(`COUNT(studentRollState.student_id) ${group.ltmt} :incidents`, { incidents: group.incidents })
        .getRawMany()

      // 3. if filter result found then add it in a groupStudent table
      if (filterResult.length > 0) await this.addGroupStudents(filterResult, group.id)

      // 3. update current group filter data
      const updateGroup: UpdateGroupInput = {
        student_count: filterResult.length,
        run_at: runAt,
        id: group.id,
      }
      group.prepareToUpdate(updateGroup)
      await this.groupRepository.save(group)
    })

    return { result: true }
  }
}
