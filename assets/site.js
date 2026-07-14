(() => {
  'use strict'

  const SCHEMA = 'public-project-progress-v1'
  const EXPECTED_BOUNDARIES = [
    'SignalEnvelope',
    'EntityRelation',
    'VariableObservation',
    'InvestmentSkill',
    'HypothesisV2',
    'AlphaAlert',
  ]

  const byId = (id) => {
    const element = document.getElementById(id)
    if (!element) throw new Error('Missing public report element.')
    return element
  }

  const setText = (id, value) => {
    byId(id).textContent = String(value)
  }

  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  const safeInteger = (value) => Number.isSafeInteger(value) && value >= 0
  const safeText = (value, maximum = 200) => (
    typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f<>]/u.test(value)
    && !/\/(?:Users|home|private|var|tmp)\//iu.test(value)
    && !/\b(?:api[_-]?key|authorization|bearer|cookie|password|passwd|secret|token)\b/iu.test(value)
  )
  const safeTimestamp = (value) => (
    typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    && !Number.isNaN(Date.parse(value))
  )

  function assertCommitState(value) {
    if (
      !isRecord(value)
      || !safeText(value.branch, 140)
      || !/^[a-f0-9]{8}$/u.test(value.commit)
      || !safeText(value.subject, 120)
      || !safeTimestamp(value.committedAt)
    ) throw new Error('Invalid public commit state.')
  }

  function assertSnapshot(value) {
    if (
      !isRecord(value)
      || value.schema !== SCHEMA
      || !safeTimestamp(value.generatedAt)
      || !isRecord(value.project)
      || value.project.name !== 'Variable-Driven Alpha Workbench'
      || value.project.visibility !== 'public-report'
      || !isRecord(value.development)
      || !isRecord(value.development.worktree)
      || !isRecord(value.development.diff)
      || !isRecord(value.architecture)
      || !Array.isArray(value.architecture.boundaries)
      || value.architecture.boundaries.length !== EXPECTED_BOUNDARIES.length
      || value.architecture.boundaries.some((item, index) => item !== EXPECTED_BOUNDARIES[index])
      || !isRecord(value.delivery)
      || !isRecord(value.delivery.verification)
      || !Array.isArray(value.delivery.recentSlices)
      || value.delivery.recentSlices.length > 12
      || value.delivery.recentSlices.some((slice) => (
        !isRecord(slice)
        || !/^\d{4}-\d{2}-\d{2}$/u.test(slice.date)
        || !safeText(slice.title, 180)
      ))
      || !safeInteger(value.delivery.acceptedSliceCount)
      || !safeInteger(value.development.aheadOfMain)
      || !safeInteger(value.development.behindMain)
      || !safeInteger(value.development.worktree.changedFiles)
      || !safeInteger(value.development.diff.files)
    ) throw new Error('Invalid public progress snapshot.')
    assertCommitState(value.stable)
    assertCommitState(value.development)
    if (value.delivery.latestAcceptedSlice !== null && (
      !isRecord(value.delivery.latestAcceptedSlice)
      || !/^\d{4}-\d{2}-\d{2}$/u.test(value.delivery.latestAcceptedSlice.date)
      || !safeText(value.delivery.latestAcceptedSlice.title, 180)
    )) throw new Error('Invalid latest accepted slice.')
    return value
  }

  const localDate = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const shortDate = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
  })

  function verificationLabel(value, passedText, waitingText) {
    return value === true ? { text: passedText, className: 'passed' } : { text: waitingText, className: 'waiting' }
  }

  function setVerification(id, state) {
    const element = byId(id)
    element.textContent = state.text
    element.className = state.className
  }

  function renderSnapshot(snapshot) {
    const verification = snapshot.delivery.verification
    const latest = snapshot.delivery.latestAcceptedSlice
    const testCount = verification.frontendTests ?? '—'

    setText('generatedAt', localDate.format(new Date(snapshot.generatedAt)))
    setText('acceptedSlices', snapshot.delivery.acceptedSliceCount)
    setText('aheadCount', snapshot.development.aheadOfMain)
    setText('changedFiles', snapshot.development.diff.files)
    setText('testCount', testCount)

    setText('stableBranch', snapshot.stable.branch)
    setText('stableSubject', snapshot.stable.subject)
    setText('stableCommit', snapshot.stable.commit)
    setText('stableCommittedAt', localDate.format(new Date(snapshot.stable.committedAt)))
    setText('developmentBranch', snapshot.development.branch)
    setText('developmentSubject', snapshot.development.subject)
    setText('developmentCommit', snapshot.development.commit)
    setText('worktreeCount', snapshot.development.worktree.changedFiles)
    setText('latestSliceTitle', latest?.title ?? '暂无已验收 Stage 2 切片')
    setText('latestSliceDate', latest?.date ?? '—')

    setVerification('buildState', verificationLabel(verification.buildPassed, 'Build passed', 'Build 未记录'))
    setVerification('browserState', verificationLabel(verification.browserPassed, 'Browser passed', 'Browser 未记录'))
    setVerification('rustState', verification.rustTests === null
      ? { text: 'Rust 未记录', className: 'waiting' }
      : { text: `Rust ${verification.rustTests}`, className: 'passed' })
    setVerification('auditState', verification.auditFindings === null
      ? { text: 'Audit 未记录', className: 'waiting' }
      : { text: `Audit ${verification.auditFindings} / high ${verification.auditHigh ?? '—'}`, className: 'waiting' })

    const boundaryList = byId('boundaryList')
    boundaryList.replaceChildren()
    for (const boundary of snapshot.architecture.boundaries) {
      const item = document.createElement('span')
      item.textContent = boundary
      boundaryList.append(item)
    }

    const acceptedSliceList = byId('acceptedSliceList')
    acceptedSliceList.replaceChildren()
    const recentSlices = [...snapshot.delivery.recentSlices].reverse()
    if (recentSlices.length === 0) {
      const item = document.createElement('li')
      item.textContent = '暂无已验收 Stage 2 切片。'
      acceptedSliceList.append(item)
    } else {
      for (const slice of recentSlices) {
        const item = document.createElement('li')
        const date = document.createElement('time')
        const title = document.createElement('span')
        date.dateTime = slice.date
        date.textContent = slice.date
        title.textContent = slice.title
        item.append(date, title)
        acceptedSliceList.append(item)
      }
    }

    const ageHours = (Date.now() - Date.parse(snapshot.generatedAt)) / 3_600_000
    const state = byId('updateState')
    state.className = ageHours <= 36 ? 'update-state ready' : 'update-state error'
    state.lastChild.textContent = ageHours <= 36 ? '公开快照已更新' : '公开快照超过 36 小时未更新'
  }

  function renderHistory(history) {
    if (!Array.isArray(history) || history.length > 90) throw new Error('Invalid public history.')
    const snapshots = history.map(assertSnapshot)
      .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt))
    const maxAhead = Math.max(1, ...snapshots.map((item) => item.development.aheadOfMain))
    const chart = byId('historyChart')
    const rows = byId('historyRows')
    chart.replaceChildren()
    rows.replaceChildren()

    if (snapshots.length === 0) {
      const empty = document.createElement('p')
      empty.textContent = '尚无历史点位，第一次 08:30 更新后出现。'
      chart.append(empty)
      const row = document.createElement('tr')
      const cell = document.createElement('td')
      cell.colSpan = 4
      cell.textContent = '尚无历史快照'
      row.append(cell)
      rows.append(row)
      return
    }

    for (const snapshot of snapshots) {
      const bar = document.createElement('div')
      const label = document.createElement('span')
      bar.className = 'history-bar'
      bar.style.height = `${Math.max(4, (snapshot.development.aheadOfMain / maxAhead) * 145)}px`
      bar.setAttribute('aria-label', `${shortDate.format(new Date(snapshot.generatedAt))}：领先 main ${snapshot.development.aheadOfMain} 个提交`)
      label.textContent = snapshot.development.aheadOfMain
      bar.append(label)
      chart.append(bar)

      const row = document.createElement('tr')
      const values = [
        shortDate.format(new Date(snapshot.generatedAt)),
        snapshot.development.commit,
        snapshot.development.aheadOfMain,
        snapshot.delivery.acceptedSliceCount,
      ]
      for (const value of values) {
        const cell = document.createElement('td')
        cell.textContent = String(value)
        row.append(cell)
      }
      rows.append(row)
    }
  }

  async function loadReport() {
    try {
      const [progressResponse, historyResponse] = await Promise.all([
        fetch('progress.json', { cache: 'no-store', credentials: 'omit' }),
        fetch('history.json', { cache: 'no-store', credentials: 'omit' }),
      ])
      if (!progressResponse.ok || !historyResponse.ok) throw new Error('Public snapshot request failed.')
      const [snapshot, history] = await Promise.all([progressResponse.json(), historyResponse.json()])
      renderSnapshot(assertSnapshot(snapshot))
      renderHistory(history)
    } catch {
      byId('loadError').hidden = false
      const state = byId('updateState')
      state.className = 'update-state error'
      state.lastChild.textContent = '公开快照读取失败'
    }
  }

  function wireReadingProgress() {
    const progress = byId('readingProgress')
    const update = () => {
      const height = document.documentElement.scrollHeight - window.innerHeight
      const ratio = height > 0 ? window.scrollY / height : 0
      progress.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
  }

  function wireQuiz() {
    const form = byId('quizForm')
    const result = byId('quizResult')
    const questions = [...form.querySelectorAll('.question')]

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      let score = 0
      let answered = 0
      for (const question of questions) {
        const selected = question.querySelector('input:checked')
        const correct = selected?.value === question.dataset.answer
        if (selected) answered += 1
        if (correct) score += 1
        question.classList.add('graded')
        question.classList.toggle('correct', correct)
        question.classList.toggle('incorrect', !correct)
      }
      const passed = score >= 10
      result.className = `quiz-result ${passed ? 'pass' : 'fail'}`
      result.textContent = passed
        ? `通过：${score} / 12。你已经掌握本项目最重要的证据与权威边界。`
        : `未通过：${score} / 12${answered < 12 ? `，还有 ${12 - answered} 题未作答` : ''}。通过线是 10 分。`
      result.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })

    byId('resetQuiz').addEventListener('click', () => {
      form.reset()
      for (const question of questions) question.classList.remove('graded', 'correct', 'incorrect')
      result.className = 'quiz-result'
      result.textContent = '尚未提交，请完成 12 题。'
    })
  }

  wireReadingProgress()
  wireQuiz()
  void loadReport()
})()
