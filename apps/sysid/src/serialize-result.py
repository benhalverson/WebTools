def _webtools_encode(value):
    """Encode numeric FFI vectors without losing NaN or infinity at the JSON boundary."""
    import json
    import math

    def numeric_wire(item):
        """Copy supported numeric containers and tag only nonfinite scalar values."""
        if hasattr(item, "to_py"):
            item = item.to_py()
        if hasattr(item, "tolist"):
            item = item.tolist()
        if isinstance(item, (list, tuple)):
            return [numeric_wire(element) for element in item]
        if isinstance(item, dict):
            return {key: numeric_wire(element) for key, element in item.items()}
        if isinstance(item, float) and not math.isfinite(item):
            return "NaN" if math.isnan(item) else "Infinity" if item > 0 else "-Infinity"
        if isinstance(item, (int, float)):
            return item
        raise TypeError("Expected a numeric identification result")

    return json.dumps(numeric_wire(value), allow_nan=False)
