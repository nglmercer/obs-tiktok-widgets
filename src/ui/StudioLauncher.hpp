#pragma once
#include <QProcess>
#include <QTimer>
#include <QJsonDocument>
#include <QJsonObject>
#include <QUrlQuery>
#include <QFileInfo>
#include <QStandardPaths>
#include <QCoreApplication>
#include <functional>
namespace tt {
// Owns the helper for the dock's lifetime. Credentials stay in memory only.
class StudioLauncher : public QObject {
public:
	enum class State { Idle, Starting, Ready, Error };
	State state = State::Idle;
	std::function<void(const QUrl &)> navigate;
	std::function<void(State, const QString &)> changed;
	explicit StudioLauncher(QObject *parent = nullptr) : QObject(parent)
	{
		timeout.setSingleShot(true);
		connect(&timeout, &QTimer::timeout, this, [this] {
			fail("Studio startup timed out.");
			process.kill();
		});
		connect(&process, &QProcess::readyReadStandardOutput, this,
			[this] { consume(process.readAllStandardOutput()); });
		connect(&process, &QProcess::readyReadStandardError, this, [this] { process.readAllStandardError(); });
		connect(&process, &QProcess::errorOccurred, this, [this](QProcess::ProcessError) {
			fail("Studio could not start or crashed. Reopen to retry.");
		});
		connect(&process, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this,
			[this](int, QProcess::ExitStatus) {
				timeout.stop();
				url = QUrl();
				buffer.clear();
				if (state != State::Error)
					update(State::Idle, "Studio stopped.");
			});
	}
	~StudioLauncher() override
	{
		timeout.stop();
		process.terminate();
		if (!process.waitForFinished(1000)) {
			process.kill();
			process.waitForFinished(1000);
		}
	}
	static QString executable(const QString &assets)
	{
#ifdef Q_OS_WIN
		const QString name = "widgetstudio.exe";
#else
		const QString name = "widgetstudio";
#endif
		for (const auto &path :
		     QStringList{assets + "/../../bin/64bit/" + name, assets + "/../../MacOS/" + name,
				 assets + "/../../../MacOS/" + name, assets + "/../MacOS/" + name,
				 QCoreApplication::applicationDirPath() + "/" + name})
			if (QFileInfo(path).isExecutable())
				return QFileInfo(path).absoluteFilePath();
		return QStandardPaths::findExecutable(name);
	}
	void open(const QString &tool, const QStringList &args, const QString &widget, int startupTimeout = 15000)
	{
		selected = widget;
		if (state == State::Ready) {
			show();
			return;
		}
		if (process.state() != QProcess::NotRunning)
			return;
		buffer.clear();
		url = QUrl();
		update(State::Starting, "Starting Studio…");
		timeout.start(startupTimeout);
		process.start(tool, args);
	}
	// Newline framing permits fragmented and coalesced startup packets.
	void consume(const QByteArray &bytes)
	{
		buffer += bytes;
		if (buffer.size() > 65536) {
			fail("Invalid Studio startup response.");
			process.kill();
			return;
		}
		while (buffer.contains('\n')) {
			const int end = buffer.indexOf('\n');
			const auto line = buffer.left(end);
			buffer.remove(0, end + 1);
			const auto packet = QJsonDocument::fromJson(line).object();
			if (state != State::Starting)
				continue;
			if (packet["ok"] == false) {
				fail("Studio initialization failed.");
				process.kill();
				continue;
			}
			const QUrl candidate(packet["data"].toObject()["url"].toString());
			if (candidate.scheme() != "http" || candidate.host() != "127.0.0.1" ||
			    candidate.fragment().isEmpty())
				continue;
			url = candidate;
			timeout.stop();
			update(State::Ready, "Studio ready.");
			show();
		}
	}

private:
	QProcess process;
	QTimer timeout;
	QByteArray buffer;
	QUrl url;
	QString selected;
	void update(State s, const QString &message)
	{
		state = s;
		if (changed)
			changed(s, message);
	}
	void fail(const QString &message)
	{
		timeout.stop();
		url = QUrl();
		update(State::Error, message);
	}
	void show()
	{
		QUrl target(url);
		QUrlQuery query(target);
		if (!selected.isEmpty())
			query.addQueryItem("widget", selected);
		target.setQuery(query);
		if (navigate)
			navigate(target);
	}
};
} // namespace tt
