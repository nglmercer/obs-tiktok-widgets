#pragma once
#include <QAction>
#include <QPushButton>
#include <QJsonDocument>
#include <QKeySequence>
#include <QIcon>
#include <QEvent>
#include <QToolTip>
#include "projects/ProjectIO.hpp"
namespace tt {
class ActionFocusTip : public QObject {
public:
	using QObject::QObject;
	bool eventFilter(QObject *object, QEvent *event) override
	{
		auto *widget = qobject_cast<QWidget *>(object);
		if (widget && event->type() == QEvent::FocusIn)
			QToolTip::showText(widget->mapToGlobal(QPoint(0, widget->height())), widget->toolTip(), widget);
		if (event->type() == QEvent::FocusOut)
			QToolTip::hideText();
		return false;
	}
};
inline QAction *widgetAction(QObject *parent, const QString &assets, const QString &id)
{
	const auto list = QJsonDocument::fromJson(readFile(assets + "/icons/actions.json")).array();
	for (const auto &v : list) {
		auto a = v.toObject();
		if (a["id"] != id)
			continue;
		auto *action = new QAction(QIcon(assets + "/icons/" + id + ".svg"), a["label"].toString(), parent);
		action->setObjectName("widget.action." + id);
		action->setToolTip(a["label"].toString() + " · " + a["description"].toString() + " · " +
				   a["shortcut"].toString());
		if (!a["shortcut"].toString().isEmpty())
			action->setShortcut(QKeySequence(a["shortcut"].toString()));
		return action;
	}
	return nullptr;
}
inline void decorateWidgetButton(QPushButton *button, const QString &assets, const QString &id)
{
	auto *a = widgetAction(button, assets, id);
	if (!a)
		return;
	button->setIcon(a->icon());
	button->setToolTip(a->toolTip());
	button->setAccessibleName(a->text());
	button->setObjectName(a->objectName());
	button->addAction(a);
	button->installEventFilter(new ActionFocusTip(button));
	QObject::connect(a, &QAction::triggered, button, &QPushButton::click);
}
} // namespace tt
