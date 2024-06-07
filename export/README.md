## admissionRating.csv

Ratings provided by volunteers on student applications. Only applications from a
public application are usually rated, most of the applications come through
partners and will not be rated.

- Numeric ratings are from 0-10, where 10 is best fit, and 0 is worst fit.
- Reviewers also provide a rating on which track they think is best.

[Read more about rating criteria.](https://codeday.notion.site/Review-Criteria-c613814ad87c491c9c9264d64a9d1e98?pvs=4)

## artifact.csv and artifactType.csv

Artifacts are things like blog posts and presentations (but NOT a PR)
ArtifactType specifies which artifacts are collected from each event, and
Artifact stores the submissions.

An artifact may be either per-team or per-student.

Currently not used.

## emailSent.csv

Log of all automated emails sent to a student/mentor/project group.

## events.csv

An event is an individual cohort of students participating in an open-source
experience. (Events which are `active` are currently ongoing.)

### Tracks

You will see references to tracks throughout the system.

Each event is separated into three "tracks": BEGINNER, INTERMEDIATE, and
ADVANCED. Students can apply for whatever track they want, but they are
sorted by volunteers.

The track affects which projects students can be recommended and match with:

- Beginner projects are projects which have an obvious (for an experienced
  developer) starting point, and which would take an experienced
  developer 1-2 hours to solve.
- Intermediate projects are well-defined projects which would take an
  experienced developer 1-2 weeks to solve.
- Advanced projects are poorly-defined projects which would take an experienced
  developer 1-2 weeks to solve.

In general, beginner projects are assigned to high school students participating
for a summer or college freshmen/sophomores/juniors doing a 1-month
micro-internship. Intermediate or advanced projects are assigned to college
students participating for a summer.

Students in the intermediate or advanced track will sometimes be recommended
projects from the other track, with a warning. Beginner students will never be
recommended intermediate/advanced tracks, and vice-versa.

## meeting.csv, meetingAttendance.csv, and meetingResponse.csv

These files keep track of the regularly scheduled meetings which happen
throughout the program. Meeting keeps track of dates/times, meetingAttendance
keeps track of who attended, and meetingResponse keeps track of agendas and/or
reflections.

Not currently used.

## mentor.csv

A mentor is an industry professional who helps students achieve their assignment
without expending significant effort. (1-3 hours a week.) They usually play the
role of a near-peer who can provide helpful tips on debugging and approaching
problems, but they are NOT subject matter experts.

In most cases, 1 mentor will host 1 project per event, but a project could be
hosted by multiple mentors, and/or a mentor could have multiple projects (each
with its own students). See the `project.csv` documentation for more information
about resolving the relationships.

Mentor records are unique per `eventId`, e.g. if you want to uniquely identify a
_person_, you need to compare the anonymized email address or name.

## note.csv

Notes are entered by program staff (largely TAs, who provide pair-programming
and debugging assistance). They contain literal text notes, but these are
removed from the dataset for privacy. The dataset does include a "caution" value
which indicates the level of concern of the person who entered the note, from
0 (no concern) to 1 (very concerned).

## project.csv

Projects are always one of two things:

- Creating a new open-source project
- Solving a task in an existing open-source project

You can generally determine which type of project it is by if it has the `oss`
or `new` tag applied.

The project table contains a lot of information about what the students did:

- description, if present, is a narrative text description of what the students
  will do.
- deliverables, if present, are the specific "check-off-able" tasks students
  are expected to complete by the end in order for the project to be a success.
- issueUrl, if present, is a link to the assigned issue.

Project may have multiple of these fields set.

### Relations

- During the summer program, students are given the opportunity to express a
  preference for which projects they want to do, which is stored in
  `projectPreferences.csv`
- A map of projects to mentors is in `_mentorToProject.csv` (A is mentor ID, B
  is project ID).
- A map of projects to students is in `_projectToStudent.csv` (A is project ID,
  B is student ID)
- A map of tags applied to projects is in `_projectToTag.csv` (A is project ID,
  B is tag ID)

### More Fields

- `affinePartnerId`: If present the project was only shown to students from a
  specific partner school or subgroup.
- `status`: Only projects which are MATCHED actually had students work on them.

### Project Matching

During the summer program, students first see 25 recommended projects, and
submit their ranked preference for at least 6 of their favorites. We use an
algorithm to form groups based on their preferences and availability.

[More info.](https://www.youtube.com/watch?v=i3SyCxuXTtg)

### Outcomes

If the project resulted in a PR, a value _should_ be specified in the `prUrl`
field. This data is self-reported by students, and probably somewhat of an
under-estimate.

Also, projects which involve creation of a new open-source project do not result
in a PR. These projects are usually only used for our summer programs, so `prUrl`
is much more accutate for the school-year micro-internships and you will see
more nulls in the summer.

## projectEmail.csv

This keeps track of which emails students/mentors have responded to. This is
useful to flag students who have not replied to their initial introduction
email or are not checking their emails frequently during the program.

## resource.csv

Links provided to mentors/students/etc during the program.

## standupResult.csv and standupThread.csv

Standups occur every 1-3 days, depending on how much time we expect students
to spend. A standupThread is created each time students are asked to submit
responses, and a standupResult is created for each response.

Ratings from individual standups are as follows:

- 1 = vague
- 2 = specific, but does not represent much work
- 3 = good

Standups can also be totally missing, in which case that would be a 0.

## student.csv

A student participating in an individual event. A new row is created for each
event, so you will need to check the anonymized value of `email` or name to
find multi-event participation.

## tag.csv and tagTrainingSubmission.csv

Tags can be applied to students and/or projects. Student tags are an expression
of interest and used in recommending projects (see the documentation about
matching in `project.csv` above). Project tags are also used to assign
onboarding assigments, which students must complete during their first week.