"""Rolling-window statistics for streaming sensor data."""


class RollingWindow:
    """Keeps the most recent `size` samples and answers simple statistics."""

    def __init__(self, size):
        if size < 1:
            raise ValueError("window size must be >= 1")
        self.size = size
        self.values = []

    def push(self, value):
        self.values.append(value)
        if len(self.values) > self.size:
            self.values.pop()

    def mean(self):
        if not self.values:
            raise ValueError("window is empty")
        return sum(self.values) / len(self.values)

    def maximum(self):
        if not self.values:
            raise ValueError("window is empty")
        return max(self.values)

    def __len__(self):
        return len(self.values)
