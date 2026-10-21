#pragma once
#include <QTcpServer>
#include <QHash>
#include <QElapsedTimer>
#include <QSet>
#include <deque>
#include <functional>
#include "core/EventDispatcher.hpp"
class QTcpSocket;
namespace tt {
// Independent of authoring IPC and scene APIs. All methods run on the Qt thread.
class ExternalEventReceiver : public QTcpServer {
	EventDispatcher &dispatcher;
	QJsonObject options;
	std::function<void(const QJsonObject &)> logger;
	QElapsedTimer clock;
	QHash<QString, QPair<qint64, int>> rates;
	QSet<QString> seen;
	std::deque<QString> order;
	QSet<QTcpSocket *> clients;
	void receiveFrames(QTcpSocket *);
	void sendFrame(QTcpSocket *, unsigned char, const QByteArray &);
	QJsonObject authenticate(const QByteArray &) const;
	void receive(QTcpSocket *);
	void respond(QTcpSocket *, int, const QJsonObject &);
	QJsonObject publish(QJsonObject, const QJsonObject &, int &);

public:
	QJsonObject counters;
	ExternalEventReceiver(EventDispatcher &, QObject *parent = nullptr);
	bool start(const QJsonObject &, std::function<void(const QJsonObject &)> log = {});
	void stop();
	~ExternalEventReceiver() override;
};
} // namespace tt
