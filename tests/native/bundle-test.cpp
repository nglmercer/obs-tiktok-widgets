#include "core/SigningBundleManager.hpp"
#include "core/PluginConfig.hpp"
#include <QCoreApplication>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QTemporaryDir>
#include <QCryptographicHash>
#include <QElapsedTimer>
#include <QTimer>
#include <QThread>
#include <QFile>
#include <cstring>
#include <stdexcept>
#include <iostream>
static void check(bool v, const char *s)
{
	if (!v)
		throw std::runtime_error(s);
}
class Reply : public QNetworkReply {
	QByteArray payload;
	qsizetype offset = 0;
	bool done = false;

protected:
	qint64 readData(char *data, qint64 size) override
	{
		auto n = qMin(size, qint64(payload.size() - offset));
		if (n <= 0)
			return -1;
		std::memcpy(data, payload.constData() + offset, size_t(n));
		offset += n;
		return n;
	}

public:
	Reply(const QNetworkRequest &request, QByteArray bytes, int status, int delay, QObject *parent)
		: QNetworkReply(parent),
		  payload(std::move(bytes))
	{
		setRequest(request);
		setUrl(request.url());
		setAttribute(QNetworkRequest::HttpStatusCodeAttribute, status);
		open(QIODevice::ReadOnly);
		QTimer::singleShot(delay, this, [this] {
			if (done)
				return;
			emit readyRead();
			if (done)
				return;
			emit downloadProgress(payload.size(), payload.size());
			if (done)
				return;
			done = true;
			setFinished(true);
			emit finished();
		});
	}
	bool isSequential() const override { return true; }
	qint64 bytesAvailable() const override { return payload.size() - offset + QNetworkReply::bytesAvailable(); }
	void abort() override
	{
		if (done)
			return;
		done = true;
		setError(OperationCanceledError, "Canceled");
		setFinished(true);
		emit finished();
	}
};
class Network : public QNetworkAccessManager {
protected:
	QNetworkReply *createRequest(Operation, const QNetworkRequest &r, QIODevice *) override
	{
		++requests;
		check(r.url().scheme() == "https", "trusted HTTPS policy");
		check(r.attribute(QNetworkRequest::RedirectPolicyAttribute).toInt() ==
			      QNetworkRequest::ManualRedirectPolicy,
		      "redirects disabled");
		return new Reply(r, bytes, status, delay, this);
	}

public:
	int requests = 0, status = 200, delay = 2;
	QByteArray bytes = "/* trusted offline bundle fixture */";
};
static void waitFor(std::function<bool()> predicate)
{
	QElapsedTimer time;
	time.start();
	while (!predicate() && time.elapsed() < 1000) {
		QCoreApplication::processEvents();
		QThread::msleep(1);
	}
	check(predicate(), "callback timeout");
}
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	QTemporaryDir directory;
	tt::PluginConfig config(directory.path());
	Network network;
	auto hash = QString::fromLatin1(QCryptographicHash::hash(network.bytes, QCryptographicHash::Sha256).toHex());
	tt::SigningBundlePolicy policy{"https://fixtures.invalid/bundle.js", hash, 500, 1024};
	tt::SigningBundleManager manager(config, nullptr, &network, policy);
	bool first = false, finished = false;
	QString error, source;
	manager.ensure([&](QString, QString) { first = true; });
	manager.ensure([&](QString s, QString e) {
		source = s;
		error = e;
		finished = true;
	});
	check(network.requests == 1, "shared single download");
	waitFor([&] { return finished; });
	check(!first && !source.isEmpty() && error.isEmpty(), "verified completion");
	finished = false;
	manager.ensure([&](QString s, QString e) {
		source = s;
		error = e;
		finished = true;
	});
	check(finished && network.requests == 1, "cache reuse without network");
	QFile cache(directory.path() + "/webmssdk-1.0.0.388.js");
	check(cache.open(QIODevice::WriteOnly), "corrupt cache open");
	cache.write("corrupt");
	cache.close();
	network.bytes = "malicious";
	finished = false;
	manager.ensure([&](QString s, QString e) {
		source = s;
		error = e;
		finished = true;
	});
	waitFor([&] { return finished; });
	check(source.isEmpty() && !error.isEmpty(), "invalid download never used");
	check(cache.open(QIODevice::ReadOnly), "cache check");
	check(cache.readAll() == "corrupt", "rejected download not cached");
	cache.close();
	network.status = 302;
	finished = false;
	manager.ensure([&](QString s, QString e) {
		source = s;
		error = e;
		finished = true;
	});
	waitFor([&] { return finished; });
	check(source.isEmpty() && !error.isEmpty(), "redirect rejected");
	network.status = 200;
	network.bytes = QByteArray(2048, 'x');
	finished = false;
	manager.ensure([&](QString s, QString e) {
		source = s;
		error = e;
		finished = true;
	});
	waitFor([&] { return finished; });
	check(source.isEmpty() && !error.isEmpty(), "size limit");
	network.delay = 100;
	finished = false;
	manager.ensure([&](QString, QString) { finished = true; });
	manager.cancel();
	for (int i = 0; i < 10; ++i)
		QCoreApplication::processEvents();
	check(!finished && !manager.isDownloading(), "cancel suppresses pending connection");
	tt::SigningBundleManager shortTimeout(config, nullptr, &network, {policy.url, policy.sha256, 1, 1024});
	finished = false;
	shortTimeout.ensure([&](QString s, QString e) {
		source = s;
		error = e;
		finished = true;
	});
	waitFor([&] { return finished; });
	check(source.isEmpty() && !error.isEmpty(), "timeout bounded");
	std::cout
		<< "Automatic verified download, cache reuse, request sharing, checksum, redirect, size, cancellation and timeout checks passed\n";
}
