const _spawn = require("child_process").spawn
const { join } = require("path")

const gulp = require("gulp")
const cached = require("gulp-cached")
// const debug = require("gulp-debug")
// const exec = require("gulp-exec")
const pegjs = require("gulp-pegjs")
const sourcemaps = require("gulp-sourcemaps")
const gulpTslint = require("gulp-tslint")
const tslint = require("tslint")
const ts = require("gulp-typescript")

const tsProject = ts.createProject("tsconfig.json", {
  declaration: true,
})
const reporter = ts.reporter.longReporter()

const tsSources = "src/**/*.ts"
const testTsSources = "test/**/*.ts"
const pegjsSources = "src/*.pegjs"

const staticFiles = ["package.json", "package-lock.json", "static/**", ".snyk"]

let destDir = "build"

class TaskError extends Error {
  toString() {
    return this.messsage
  }
}

function setDestDir(path) {
  destDir = path
}

const children = []

process.env.FORCE_COLOR = true

function spawn(cmd, args, cb) {
  const child = _spawn(cmd, args, { stdio: "pipe", shell: true, env: process.env })
  children.push(child)

  const output = []
  child.stdout.on("data", (data) => output.push(data))
  child.stderr.on("data", (data) => output.push(data))

  child.on("exit", (code) => {
    if (code !== 0) {
      console.log(output.join(""))
      die()
    }
    cb()
  })

  return child
}

function die() {
  for (const child of children) {
    !child.killed && child.kill()
  }
  process.exit(1)
}

gulp.task("check-licenses", (cb) =>
  spawn("./bin/check-licenses", [], cb)
)

gulp.task("mocha", (cb) =>
  spawn("node_modules/.bin/nyc", ["node_modules/.bin/mocha"], cb)
)

gulp.task("pegjs", () =>
  gulp.src(pegjsSources)
    .pipe(pegjs({ format: "commonjs" }))
    .pipe(gulp.dest(join(destDir, "src")))
)

gulp.task("pegjs-watch", () =>
  gulp.watch(pegjsSources, gulp.parallel("pegjs"))
)

gulp.task("static", () => {
  return gulp.src(staticFiles, { base: "./" })
    .pipe(cached("static"))
    .pipe(gulp.dest(destDir))
})

gulp.task("static-watch", () => {
  return gulp.watch(staticFiles, gulp.parallel("static"))
})

gulp.task("tsc", () =>
  tsProject.src()
    .pipe(sourcemaps.init())
    .pipe(tsProject(reporter))
    .on("error", die)
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(join(destDir, "src")))
)

gulp.task("tsc-watch", () =>
  _spawn("tsc", [
      "-w",
      "--pretty",
      "--declaration",
      "-p", __dirname,
      "--outDir", join(destDir, "src"),
    ],
    { stdio: "inherit" },
  )
)

gulp.task("tsfmt", (cb) => {
  spawn("node_modules/.bin/tsfmt", ["--verify"], cb)
})

gulp.task("tsfmt-watch", () => {
  const verify = (path) => {
    try {
      _spawn("node_modules/.bin/tsfmt", ["--verify", path], { stdio: "inherit" })
    } catch (_) { }
  }

  return gulp.watch([tsSources, testTsSources])
    .on("add", verify)
    .on("change", verify)
})

gulp.task("tslint", () =>
  gulp.src(tsSources)
    .pipe(cached("tslint"))
    .pipe(gulpTslint({
      program: tslint.Linter.createProgram("./tsconfig.json"),
      formatter: "verbose"
    }))
    .pipe(gulpTslint.report())
)

gulp.task("tslint-tests", () =>
  gulp.src(testTsSources)
    .pipe(cached("tslint-tests"))
    .pipe(gulpTslint({
      formatter: "verbose"
    }))
    .pipe(gulpTslint.report())
)

gulp.task("tslint-watch", () =>
  gulp.watch([tsSources, testTsSources], gulp.parallel("tslint", "tslint-tests"))
)

gulp.task("lint", gulp.parallel("check-licenses", "tslint", "tslint-tests", "tsfmt"))
gulp.task("build", gulp.parallel("pegjs", "static", "tsc"))
gulp.task("dist", gulp.series((done) => { setDestDir("dist"); done() }, "lint", "build"))
gulp.task("test", gulp.parallel("build", "lint", "mocha"))
gulp.task("watch", gulp.parallel("pegjs-watch", "static-watch", "tsc-watch", "tsfmt-watch", "tslint-watch"))
gulp.task("default", gulp.series("watch"))