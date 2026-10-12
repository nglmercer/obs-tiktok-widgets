#include "WidgetBuilder.hpp"
#include <QProcess>
#include <QProcessEnvironment>
#include <QStandardPaths>
#include <QDir>
#include <QElapsedTimer>
#include <QFileInfo>
namespace tt {
void validateBuildMode(const QJsonObject &b)
{
	if (b.isEmpty())
		return;
	if (b["mode"] == "static") {
		if (b.size() != 1)
			throw DomainError("UNSUPPORTED_BUILDER", "Static mode does not accept compiler options");
		return;
	}
	if (b["mode"] != "vite" || !QStringList{"vanilla", "react"}.contains(b["framework"].toString()) ||
	    b["language"] != "typescript" || b["target"] != "obs-browser" || b["assetBase"] != "./")
		throw DomainError(
			"UNSUPPORTED_BUILDER",
			"Supported modes: static, Vite TypeScript vanilla or React; target obs-browser, assetBase ./");
	for (auto it = b.begin(); it != b.end(); ++it)
		if (!QStringList{"mode", "language", "framework", "target", "assetBase"}.contains(it.key()))
			throw DomainError("UNSUPPORTED_BUILDER", "Untrusted build options are not accepted");
}
static QByteArray run(const QString &program, const QStringList &args, const QString &cwd, int timeout,
		      std::function<bool()> stale = {})
{
	QProcess p;
	QProcessEnvironment env;
	env.insert("PATH", qEnvironmentVariable("PATH"));
	env.insert("LANG", "C.UTF-8");
	env.insert("NODE_OPTIONS", "--max-old-space-size=256");
	env.insert("HOME", cwd + "/.builder-home");
	env.insert("npm_config_cache", cwd + "/.npm-cache");
	env.insert("npm_config_ignore_scripts", "true");
#ifdef Q_OS_WIN
	env.insert("SystemRoot", qEnvironmentVariable("SystemRoot"));
	env.insert("TEMP", QDir::tempPath());
#endif
	p.setProcessEnvironment(env);
	p.setWorkingDirectory(cwd);
	p.setProcessChannelMode(QProcess::MergedChannels);
	p.start(program, args);
	if (!p.waitForStarted(3000))
		throw DomainError("BUILD_TOOL_REQUIRED", "Cannot start pinned build tooling");
	QElapsedTimer timer;
	timer.start();
	QByteArray output;
	qint64 checked = 0;
	while (p.state() != QProcess::NotRunning) {
		p.waitForFinished(50);
		output += p.readAll();
		if (stale && timer.elapsed() - checked > 250) {
			checked = timer.elapsed();
			bool cancelled = false;
			try {
				cancelled = stale();
			} catch (...) {
				cancelled = true;
			}
			if (cancelled) {
				p.kill();
				p.waitForFinished();
				throw DomainError("REVISION_CONFLICT",
						  "Source changed: obsolete compilation cancelled");
			}
		}
		if (timer.elapsed() > timeout || output.size() > 2 * 1024 * 1024) {
			p.kill();
			p.waitForFinished();
			throw DomainError("BUILD_LIMIT", "Builder timeout/output limit exceeded");
		}
	}
	output += p.readAll();
	if (p.exitStatus() != QProcess::NormalExit || p.exitCode() != 0)
		throw DomainError("COMPILE_ERROR", QString::fromUtf8(output.left(128 * 1024)),
				  {{"diagnostics", QString::fromUtf8(output.left(128 * 1024))}});
	return output;
}
QJsonObject builderStatus(const QString &root)
{
	const auto dir = safePath(root, "cache/toolchain-v3");
	return {{"installed", QFileInfo::exists(dir + "/node_modules/vite/package.json")},
		{"node", !QStandardPaths::findExecutable("node").isEmpty()},
		{"networkDuringBuild", false},
		{"policy", "Pinned Vite/React only; no author config, plugins or lifecycle scripts"}};
}
QJsonObject installBuilder(const QString &root, const QString &assets, bool consent)
{
	if (!consent)
		throw DomainError(
			"CONSENT_REQUIRED",
			"Installing pinned third-party build tooling requires --confirm; executable dependencies remain trusted code");
	const auto dir = safePath(root, "cache/toolchain-v3");
	QDir().mkpath(dir);
	for (const auto &f : {"package.json", "package-lock.json", "runner.mjs", "sdk.ts", "react-sdk.ts"})
		atomicWrite(safePath(dir, f), readFile(safePath(assets + "/builder", f)));
	const auto npm = QStandardPaths::findExecutable("npm");
	if (npm.isEmpty())
		throw DomainError("BUILD_TOOL_REQUIRED",
				  "Node/npm must be installed separately for opt-in framework builds");
	run(npm, {"ci", "--ignore-scripts", "--no-audit", "--no-fund"}, dir, 120000);
	return builderStatus(root);
}
void compileWidget(const QString &root, const QString &assets, const QString &snapshot, const QString &out,
		   const QJsonObject &b, std::function<bool()> stale)
{
	validateBuildMode(b);
	const auto dir = safePath(root, "cache/toolchain-v3");
	if (!builderStatus(root)["installed"].toBool())
		throw DomainError("BUILD_TOOL_REQUIRED",
				  "Run widgetctl builders install --confirm to install the pinned offline toolchain");
	for (const auto &f : {"package.json", "package-lock.json", "runner.mjs", "sdk.ts", "react-sdk.ts"})
		if (readFile(safePath(dir, f)) != readFile(safePath(assets + "/builder", f)))
			throw DomainError("TOOLCHAIN_MISMATCH",
					  "Installed toolchain differs from packaged policy; reinstall explicitly");
	if (readFile(snapshot + "/src/package-lock.json") != readFile(assets + "/builder/package-lock.json") ||
	    readFile(snapshot + "/src/package.json") != readFile(assets + "/builder/package.json"))
		throw DomainError(
			"DEPENDENCY_POLICY",
			"Framework projects require the unchanged pinned package and lockfile; arbitrary dependencies/plugins are unsupported");
	const auto node = QStandardPaths::findExecutable("node");
	if (node.isEmpty())
		throw DomainError("BUILD_TOOL_REQUIRED", "Node is unavailable; last published output remains intact");
	run(node, {dir + "/runner.mjs", snapshot, out}, dir, 30000, std::move(stale));
	treeFiles(out); // size, symlink and file-count bounds before publication
}
} // namespace tt
