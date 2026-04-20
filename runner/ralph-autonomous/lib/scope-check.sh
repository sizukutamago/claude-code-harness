# runner/ralph-autonomous/lib/scope-check.sh
# Scope check after each iteration.
# source 前提。呼び出し側で set -euo pipefail を設定すること。
# 依存: lib/config.sh (config_read, config_read_array), jq, git

SCRIPT_DIR_SCOPE_CHECK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure config.sh is loaded
if ! declare -f config_read > /dev/null 2>&1; then
  # shellcheck source=lib/config.sh
  source "${SCRIPT_DIR_SCOPE_CHECK}/config.sh"
fi

# _matches_glob <pattern> <file>
#   Returns 0 if <file> matches <pattern>, 1 otherwise.
#   Supported patterns:
#     src/**  → matches any file starting with "src/"
#     *.md    → matches root-level .md files (bash glob)
_matches_glob() {
  local pattern="$1"
  local file="$2"
  case "${pattern}" in
    *"/**")
      local prefix="${pattern%/**}"
      [[ "${file}" == "${prefix}/"* ]] && return 0
      ;;
    *)
      [[ "${file}" == ${pattern} ]] && return 0
      ;;
  esac
  return 1
}

# _file_matches_any_allowed_path <config_file> <file>
#   Returns 0 if <file> matches at least one entry in scope.allowed_paths.
_file_matches_any_allowed_path() {
  local config_file="$1"
  local file="$2"
  local pattern
  while IFS= read -r pattern || [[ -n "${pattern}" ]]; do
    [[ -z "${pattern}" ]] && continue
    if _matches_glob "${pattern}" "${file}"; then
      return 0
    fi
  done < <(config_read_array "${config_file}" ".scope.allowed_paths")
  return 1
}

# scope_check_run <config-file> <cwd>
#   Checks that the last commit's changed files are within scope constraints.
#   Exits:
#     0 — all checks passed
#     2 — scope violation (stderr contains details)
scope_check_run() {
  local config_file="$1"
  local cwd="$2"

  # Get changed files from last commit
  local changed_files
  changed_files="$(cd "${cwd}" && git diff HEAD~1 HEAD --name-only 2>/dev/null)" || true

  # If no changes, pass immediately
  if [[ -z "${changed_files}" ]]; then
    return 0
  fi

  # Count changed files
  local file_count
  file_count="$(echo "${changed_files}" | wc -l | tr -d ' ')"

  # Check max_files_changed
  local max_files
  max_files="$(config_read "${config_file}" ".scope.max_files_changed")"
  if [[ -n "${max_files}" ]] && (( file_count > max_files )); then
    echo "scope check failed: max_files_changed exceeded (changed=${file_count}, max=${max_files})" >&2
    return 2
  fi

  # Check each file against allowed_paths
  local file
  while IFS= read -r file; do
    [[ -z "${file}" ]] && continue
    if ! _file_matches_any_allowed_path "${config_file}" "${file}"; then
      echo "scope check failed: file '${file}' is outside allowed_paths" >&2
      return 2
    fi
  done <<< "${changed_files}"

  return 0
}
